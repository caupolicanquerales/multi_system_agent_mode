param(
    [Parameter(Mandatory)][string]$ProjectLocation,
    [string]$MvnExe = 'mvn',
    [Parameter(Mandatory)][string]$Artifacts,
    [Parameter(Mandatory)][string]$ActiveRecipes
)

Set-Location $ProjectLocation
$yml = Get-Content "$PSScriptRoot\rewrite-custom.yml" -Raw
[System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml)
Write-Host 'Ensure Java 21 is set as the active JDK before running this command'
& $MvnExe org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -q -B --no-transfer-progress `
  "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" `
  "-Drewrite.recipeArtifactCoordinates=$Artifacts" `
  "-Drewrite.activeRecipes=$ActiveRecipes" `
  "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*" `
  "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*" `
  "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST" `
  "-Dmaven.compiler.failOnError=false" `
  "-Dspring.version=6.1.14"
if ($LASTEXITCODE -eq 0) {
    & $MvnExe tidy:pom -Dpom.inplace=true 2>$null
    & $MvnExe validate -q
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'POM validation failed — removing injected text nodes from pom.xml...'
        (Get-Content pom.xml -Encoding utf8) | Where-Object { $_ -notmatch 'Dependency already updated' } | Set-Content pom.xml -Encoding utf8
        & $MvnExe validate -q
    }
} else {
    Write-Host 'OpenRewrite run failed — skipping POM sanitization.'
}