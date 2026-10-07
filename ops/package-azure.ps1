$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 does not load System.IO.Compression automatically.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactDirectory = Join-Path $projectRoot 'artifacts'
[System.IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null
$archivePath = Join-Path $artifactDirectory 'membrr-azure-source.zip'

# Package exactly the committed content at HEAD: the file list comes from git,
# never from the filesystem, and a dirty tree is refused.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git was not found on PATH; it is required to package committed files.'
}

function Invoke-Git {
    param([string[]]$GitArgs)
    # Windows PowerShell 5.1 turns native stderr into a terminating error under
    # 'Stop', so relax it for the call and check the exit code instead.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $projectRoot -c core.quotepath=off @GitArgs 2>$null
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($exitCode -ne 0) { throw "git $($GitArgs -join ' ') failed with exit code $exitCode." }
    return @($output | Where-Object { $_ })
}

try {
    $insideWorkTree = Invoke-Git @('rev-parse', '--is-inside-work-tree')
} catch {
    $insideWorkTree = @()
}
if ($insideWorkTree -notcontains 'true') {
    throw "Project root is not a git work tree: $projectRoot"
}
try {
    $headSha = @(Invoke-Git @('rev-parse', 'HEAD'))[0]
    $headSubject = @(Invoke-Git @('log', '-1', '--format=%s'))[0]
} catch {
    throw 'The repository has no commits; commit the source before packaging.'
}

$fixedFiles = @(
    'package.json', 'package-lock.json', 'next.config.ts',
    'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs',
    'prisma.config.ts', 'scripts/prepare-standalone.ts', 'scripts/bootstrap.ts'
)
$packagedFolders = @('src', 'public', 'prisma')

$trackedFixed = @(Invoke-Git (@('ls-files', '--') + $fixedFiles))
$untrackedFixed = @($fixedFiles | Where-Object { $_ -notin $trackedFixed })
if ($untrackedFixed.Count -gt 0) {
    throw "Required packaged files are not tracked by git: $($untrackedFixed -join ', ')"
}

# next-env.d.ts is generated and rewritten by `next dev`; a modification to it
# alone must not block packaging. It is still packaged, from its HEAD content.
$generatedFile = 'next-env.d.ts'
$generatedModified = $false
$dirtyLines = @(Invoke-Git (@('status', '--porcelain', '--untracked-files=all', '--') + $packagedFolders + $fixedFiles))
$blocking = @()
foreach ($line in $dirtyLines) {
    if ($line -match '^( M|M |MM) next-env\.d\.ts$') {
        $generatedModified = $true
    } else {
        $blocking += $line
    }
}
if ($blocking.Count -gt 0) {
    throw ("Working tree has uncommitted changes in packaged paths; commit or stash them first:`n" +
        (($blocking | ForEach-Object { "  $_" }) -join "`n"))
}

$relativeFiles = @($fixedFiles)
$relativeFiles += Invoke-Git (@('ls-files', '--') + $packagedFolders)
$relativeFiles = @($relativeFiles | Sort-Object -Unique -CaseSensitive)
foreach ($relativePath in $relativeFiles) {
    if ($relativePath -match '(^|/)(\.env[^/]*|node_modules|\.next|\.local)(/|$)') {
        throw "Excluded path encountered: $relativePath"
    }
    $sourceFile = Get-Item -LiteralPath (Join-Path $projectRoot $relativePath)
    if ($sourceFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Symbolic links cannot be packaged: $relativePath"
    }
}

# Binary-safe read of a file as committed at HEAD.
function Get-HeadFileBytes {
    param([string]$RelativePath)
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new('git')
    $startInfo.Arguments = "-C `"$projectRoot`" cat-file blob `"HEAD:$RelativePath`""
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $buffer = [System.IO.MemoryStream]::new()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardOutput.BaseStream.CopyTo($buffer)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Could not read $RelativePath from HEAD: $($errorTask.Result)" }
    return $buffer.ToArray()
}

$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relativePath in $relativeFiles) {
        if ($generatedModified -and $relativePath -eq $generatedFile) {
            $entry = $archive.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            try {
                $headBytes = Get-HeadFileBytes $relativePath
                $entryStream.Write($headBytes, 0, $headBytes.Length)
            } finally {
                $entryStream.Dispose()
            }
            continue
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $projectRoot $relativePath), $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}

$check = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entryNames = @($check.Entries | ForEach-Object { $_.FullName })
    foreach ($required in @('package.json', 'package-lock.json', 'prisma/schema.prisma', 'src/app/layout.tsx', 'scripts/prepare-standalone.ts', 'scripts/bootstrap.ts')) {
        if ($required -notin $entryNames) { throw "Missing archive entry: $required" }
    }
    if ($entryNames.Count -ne $relativeFiles.Count) { throw 'Archive file count differs from source.' }
    if ($entryNames | Where-Object { $_ -match '\\|(^|/)(\.env[^/]*|node_modules|\.next|\.local)(/|$)' }) {
        throw 'Archive contains an invalid or excluded path.'
    }
} finally {
    $check.Dispose()
}

$artifact = Get-Item -LiteralPath $archivePath
Write-Output "Created $archivePath"
Write-Output "Packaged commit $headSha ($headSubject)"
Write-Output "$($relativeFiles.Count) source files; $($artifact.Length) bytes. Archive structure verified."
Write-Output 'Requires Azure build automation and production app settings before upload; see docs/AZURE-DEPLOYMENT.md.'
