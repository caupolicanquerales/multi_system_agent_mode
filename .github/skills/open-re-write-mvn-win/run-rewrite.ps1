param(
    [Parameter(Mandatory)][string]$ProjectLocation,
    [string]$MvnExe = 'mvn',
    [Parameter(Mandatory)][string]$Artifacts,
    [Parameter(Mandatory)][string]$ActiveRecipes
)

$ErrorActionPreference = 'Stop'
Set-Location $ProjectLocation
# rewrite-openapi must always be on the classpath for the Swagger2ToOpenApi recipe
if ($Artifacts -notmatch 'rewrite-openapi') {
    $Artifacts = "$Artifacts,org.openrewrite.recipe:rewrite-openapi:RELEASE"
}
$yml = Get-Content "$PSScriptRoot\rewrite-custom.yml" -Raw -Encoding UTF8
# Unique temp path avoids collisions when parallel builds run on the same machine.
$tmpConfig = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "rewrite-custom-$([System.Guid]::NewGuid()).yml")
[System.IO.File]::WriteAllText($tmpConfig, $yml, [System.Text.Encoding]::UTF8)
# Use an argument array so PowerShell passes each flag verbatim to the native mvn process,
# preventing wildcard expansion and -D prefix stripping on Windows.
$mvnArgs = @(
    'org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run',
    '-q', '-B', '--no-transfer-progress',
    "-Drewrite.configLocation=$tmpConfig",
    "-Drewrite.recipeArtifactCoordinates=$Artifacts",
    "-Drewrite.activeRecipes=$ActiveRecipes",
    '-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*',
    '-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*',
    '-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST',
    '-Dmaven.compiler.failOnError=false',
    '-Dspring.version=6.1.14'
)
$logFile = Join-Path $env:TEMP 'build_log.txt'
$exitStatus = 0
try {
    & $MvnExe @mvnArgs > $logFile 2>&1
    $exitStatus = $LASTEXITCODE
    if ($exitStatus -eq 0) {
        & $MvnExe tidy:pom '-Dpom.inplace=true'
        & $MvnExe validate '-q'
        $exitStatus = $LASTEXITCODE
        if ($exitStatus -ne 0) {
            Write-Host 'POM validation failed — removing injected text nodes from pom.xml...'
            (Get-Content pom.xml -Encoding UTF8) | Where-Object { $_ -notmatch 'Dependency already updated' } | Set-Content pom.xml -Encoding UTF8
            & $MvnExe validate '-q'
            $exitStatus = $LASTEXITCODE
        }
    } else {
        Write-Host 'OpenRewrite run failed — skipping POM sanitization.'
    }
} catch {
    Write-Host "run-rewrite.ps1 error: $_"
    $exitStatus = 1
} finally {
    if (Test-Path $tmpConfig) { Remove-Item $tmpConfig -Force }
}
exit $exitStatus