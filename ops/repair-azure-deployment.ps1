# Run manually in your own PowerShell window. This updates the existing pep app
# and redeploys the source ZIP. It never prints the database password or URI.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$zipPath = Join-Path $projectRoot 'artifacts/membrr-azure-source.zip'
$azureTarget = @(
    '--subscription', 'fff8375e-44dd-4e35-8d4f-552dff053103',
    '--resource-group', 'rg-vaibhavnshettar-9578',
    '--name', 'pep'
)
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    throw 'The deployment ZIP is missing. Run ops/package-azure.ps1 first.'
}
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is not available in this PowerShell window.'
}

Write-Host 'Reading the existing Azure database settings...'
$settingsJson = az webapp config appsettings list @azureTarget --output json
if ($LASTEXITCODE -ne 0) { throw 'Could not read Azure settings. Run az login, then retry.' }
$settingMap = @{}
foreach ($setting in ($settingsJson | ConvertFrom-Json)) {
    $settingMap[$setting.name] = $setting.value
}

if ([string]::IsNullOrWhiteSpace($settingMap['DATABASE_URL'])) {
    foreach ($settingName in @(
        'AZURE_POSTGRESQL_HOST', 'AZURE_POSTGRESQL_USER',
        'AZURE_POSTGRESQL_PASSWORD', 'AZURE_POSTGRESQL_DATABASE',
        'AZURE_POSTGRESQL_PORT'
    )) {
        if ([string]::IsNullOrWhiteSpace($settingMap[$settingName])) {
            throw "Required Azure setting is blank: $settingName"
        }
    }
    $databaseHost = $settingMap['AZURE_POSTGRESQL_HOST'].Trim()
    if ($databaseHost -notmatch '^[a-zA-Z0-9.-]+$') {
        throw 'Database host format needs review.'
    }
    $databasePort = 0
    if (-not [int]::TryParse($settingMap['AZURE_POSTGRESQL_PORT'], [ref]$databasePort) -or
        $databasePort -lt 1 -or $databasePort -gt 65535) {
        throw 'Database port format needs review.'
    }
    $databaseUser = [Uri]::EscapeDataString($settingMap['AZURE_POSTGRESQL_USER'])
    $databasePassword = [Uri]::EscapeDataString($settingMap['AZURE_POSTGRESQL_PASSWORD'])
    $databaseName = [Uri]::EscapeDataString($settingMap['AZURE_POSTGRESQL_DATABASE'])
    $connectionString = 'postgresql://{0}:{1}@{2}:{3}/{4}?sslmode=require' -f
        $databaseUser, $databasePassword, $databaseHost, $databasePort, $databaseName

    # Pass credentials through a temporary file readable only by the current user,
    # rather than embedding credentials in the Azure CLI process arguments.
    $temporaryDirectory = Join-Path $projectRoot '.local'
    [IO.Directory]::CreateDirectory($temporaryDirectory) | Out-Null
    $temporarySettingsFile = Join-Path $temporaryDirectory (
        'azure-settings-' + [guid]::NewGuid().ToString('N') + '.json'
    )
    try {
        New-Item -ItemType File -Path $temporarySettingsFile | Out-Null
        $fileAcl = [System.Security.AccessControl.FileSecurity]::new()
        $fileAcl.SetAccessRuleProtection($true, $false)
        $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $fileAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
            $currentUserSid, 'FullControl', 'Allow'
        ))
        Set-Acl -LiteralPath $temporarySettingsFile -AclObject $fileAcl
        [IO.File]::WriteAllText($temporarySettingsFile, (
            @{ DATABASE_URL = $connectionString } | ConvertTo-Json -Compress
        ))
        az webapp config appsettings set @azureTarget --settings "@$temporarySettingsFile" --output none
        if ($LASTEXITCODE -ne 0) { throw 'Azure could not save the database setting.' }
    } finally {
        if (Test-Path -LiteralPath $temporarySettingsFile) {
            Remove-Item -LiteralPath $temporarySettingsFile -Force
        }
    }

    $verificationJson = az webapp config appsettings list @azureTarget --output json
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the saved database setting.' }
    $savedConnection = (($verificationJson | ConvertFrom-Json) |
        Where-Object name -eq 'DATABASE_URL').value
    if ($savedConnection -cne $connectionString) {
        throw 'The saved database setting did not match the expected value.'
    }
    Write-Host 'Database connection saved and verified, with TLS enabled.'
} else {
    Write-Host 'DATABASE_URL already has a value; keeping it unchanged.'
}

Write-Host 'Setting the Next.js startup command...'
az webapp config set @azureTarget --startup-file 'HOSTNAME=0.0.0.0 npm start' --output none
if ($LASTEXITCODE -ne 0) { throw 'Could not save the startup command.' }
$savedStartup = az webapp config show @azureTarget --query appCommandLine --output tsv
if ($LASTEXITCODE -ne 0 -or $savedStartup.Trim() -ne 'HOSTNAME=0.0.0.0 npm start') {
    throw 'Could not verify the startup command.'
}

Write-Host 'Uploading the ZIP and waiting for Azure to build and start the app. This may take several minutes...'
az webapp deploy @azureTarget --src-path $zipPath --type zip --timeout 600000 --output none
if ($LASTEXITCODE -ne 0) {
    throw 'Azure did not confirm deployment success. Share the latest deployment log for the next diagnosis.'
}
Write-Host 'Azure reports deployment success.'
Write-Host 'Open https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net'
Write-Host 'Database migrations, administrator setup, and email still need verification before onboarding.'
