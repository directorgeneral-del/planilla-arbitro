# Script de Compilación Local de APK con Capacitor y Gradle
# Requiere: Java JDK 17+ y Android SDK

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "⚽ Compilador de APK - Planilla Digital del Árbitro" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$CurrentDir = Get-Location
$FrontendDir = $PSScriptRoot
if (-not $FrontendDir) { $FrontendDir = $CurrentDir }
Set-Location $FrontendDir

# 1. Verificar Android SDK
$SdkPath = $env:ANDROID_HOME
if (-not $SdkPath) { $SdkPath = $env:ANDROID_SDK_ROOT }
if (-not $SdkPath -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) {
    $SdkPath = "$env:LOCALAPPDATA\Android\Sdk"
}

if (-not $SdkPath) {
    Write-Host "`n⚠️ No se detectó la variable ANDROID_HOME ni la ruta por defecto del Android SDK." -ForegroundColor Yellow
    Write-Host "Si tienes Android Studio instalado, la ruta suele ser:" -ForegroundColor Gray
    Write-Host "$env:LOCALAPPDATA\Android\Sdk`n" -ForegroundColor Gray
    
    $UserSdk = Read-Host "Ingresa la ruta de tu Android SDK (o presiona Enter para omitir)"
    if ($UserSdk -and (Test-Path $UserSdk)) {
        $SdkPath = $UserSdk
    } else {
        Write-Host "❌ No se puede compilar el APK localmente sin Android SDK." -ForegroundColor Red
        Write-Host "💡 Opciones alternativas:" -ForegroundColor Green
        Write-Host "1. Abre la carpeta 'frontend/android' en Android Studio y haz clic en 'Build APK'."
        Write-Host "2. Sube los cambios a GitHub para que GitHub Actions compile el APK automáticamente con el archivo .github/workflows/build-apk.yml"
        Set-Location $CurrentDir
        exit 1
    }
}

# 2. Configurar local.properties
$FormattedSdk = $SdkPath.Replace('\', '/')
"sdk.dir=$FormattedSdk" | Out-File -FilePath "$FrontendDir\android\local.properties" -Encoding ASCII -Force
Write-Host "✅ Android SDK configurado en local.properties: $FormattedSdk" -ForegroundColor Green

# 3. Sincronizar Assets Web en Android
Write-Host "`n📦 Sincronizando código web con el proyecto nativo..." -ForegroundColor Cyan
Copy-Item "$FrontendDir\index.html", "$FrontendDir\app.js" -Destination "$FrontendDir\www" -Force
npx cap sync android

# 4. Compilar con Gradle
Write-Host "`n🚀 Ejecutando Gradle assembleDebug..." -ForegroundColor Cyan
Set-Location "$FrontendDir\android"
.\gradlew.bat assembleDebug

# 5. Verificar resultado
$ApkPath = "$FrontendDir\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $ApkPath) {
    $DestApk = "$FrontendDir\PlanillaArbitro-Debug.apk"
    Copy-Item $ApkPath -Destination $DestApk -Force
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "🎉 ¡APK generado exitosamente!" -ForegroundColor Green
    Write-Host "Ubicación del APK: $DestApk" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "`n❌ Error al compilar el APK. Revisa los mensajes de error de Gradle." -ForegroundColor Red
}

Set-Location $CurrentDir

