$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 does not load System.IO.Compression automatically.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactDirectory = Join-Path $projectRoot 'artifacts'
[System.IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null
$archivePath = Join-Path $artifactDirectory 'membrr-azure-source.zip'

# Allowlist application source; Azure builds its own Linux dependencies.
$relativeFiles = @(
    'package.json', 'package-lock.json', 'next.config.ts',
    'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs',
    'prisma.config.ts', 'scripts/prepare-standalone.ts', 'scripts/bootstrap.ts'
)
foreach ($directory in @('src', 'public', 'prisma')) {
    $relativeFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -Recurse -File |
        ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') }
}
$relativeFiles = @($relativeFiles | Sort-Object -Unique)
foreach ($relativePath in $relativeFiles) {
    if ($relativePath -match '(^|/)(\.env[^/]*|node_modules|\.next|\.local)(/|$)') {
        throw "Excluded path encountered: $relativePath"
    }
    $sourceFile = Get-Item -LiteralPath (Join-Path $projectRoot $relativePath)
    if ($sourceFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Symbolic links cannot be packaged: $relativePath"
    }
}

$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relativePath in $relativeFiles) {
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
Write-Output "$($relativeFiles.Count) source files; $($artifact.Length) bytes. Archive structure verified."
Write-Output 'Requires Azure build automation and production app settings before upload; see docs/AZURE-DEPLOYMENT.md.'
