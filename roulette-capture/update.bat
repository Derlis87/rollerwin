@echo off
chcp 65001 >nul 2>nul
echo ============================================
echo   ROULETTE CAPTURE SYSTEM - UPDATE v3.0
echo ============================================
echo.

set REPO=https://raw.githubusercontent.com/Derlis87/rollerwin/main/roulette-capture
set TEMP_DIR=%TEMP%\roulette-capture-update

echo [1/5] Creando carpeta temporal...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo [2/5] Descargando archivos actualizados desde GitHub...
echo.

REM --- Archivos principales ---
call :DownloadFile "%REPO%/src/index.js" "%TEMP_DIR%\src\index.js"
call :DownloadFile "%REPO%/src/config.js" "%TEMP_DIR%\src\config.js"
call :DownloadFile "%REPO%/src/orchestrator.js" "%TEMP_DIR%\src\orchestrator.js"

REM --- Browser ---
call :DownloadFile "%REPO%/src/browser/stealth.js" "%TEMP_DIR%\src\browser\stealth.js"
call :DownloadFile "%REPO%/src/browser/human-behavior.js" "%TEMP_DIR%\src\browser\human-behavior.js"

REM --- Capture ---
call :DownloadFile "%REPO%/src/capture/extension-bridge.js" "%TEMP_DIR%\src\capture\extension-bridge.js"
call :DownloadFile "%REPO%/src/capture/number-processor.js" "%TEMP_DIR%\src\capture\number-processor.js"
call :DownloadFile "%REPO%/src/capture/ws-interceptor.js" "%TEMP_DIR%\src\capture\ws-interceptor.js"
call :DownloadFile "%REPO%/src/capture/inject-capture.js" "%TEMP_DIR%\src\capture\inject-capture.js"

REM --- Casinos ---
call :DownloadFile "%REPO%/src/casinos/base-casino.js" "%TEMP_DIR%\src\casinos\base-casino.js"
call :DownloadFile "%REPO%/src/casinos/betfury.js" "%TEMP_DIR%\src\casinos\betfury.js"
call :DownloadFile "%REPO%/src/casinos/pinnacle.js" "%TEMP_DIR%\src\casinos\pinnacle.js"
call :DownloadFile "%REPO%/src/casinos/stake.js" "%TEMP_DIR%\src\casinos\stake.js"

REM --- API ---
call :DownloadFile "%REPO%/src/api/rollerwin-api.js" "%TEMP_DIR%\src\api\rollerwin-api.js"

REM --- Utils ---
call :DownloadFile "%REPO%/src/utils/logger.js" "%TEMP_DIR%\src\utils\logger.js"
call :DownloadFile "%REPO%/src/utils/helpers.js" "%TEMP_DIR%\src\utils\helpers.js"
call :DownloadFile "%REPO%/src/utils/export-cookies.js" "%TEMP_DIR%\src\utils\export-cookies.js"

REM --- Extension ---
call :DownloadFile "%REPO%/extension/manifest.json" "%TEMP_DIR%\extension\manifest.json"
call :DownloadFile "%REPO%/extension/background.js" "%TEMP_DIR%\extension\background.js"
call :DownloadFile "%REPO%/extension/content.js" "%TEMP_DIR%\extension\content.js"
call :DownloadFile "%REPO%/extension/inject-main.js" "%TEMP_DIR%\extension\inject-main.js"

REM --- Package ---
call :DownloadFile "%REPO%/package.json" "%TEMP_DIR%\package.json"
call :DownloadFile "%REPO%/package-lock.json" "%TEMP_DIR%\package-lock.json"

echo.
echo [3/5] Copiando archivos actualizados...
REM Copiar src/
xcopy /y /q "%TEMP_DIR%\src\*" "src\" >nul 2>nul
REM Copiar extension/
xcopy /y /q "%TEMP_DIR%\extension\*" "extension\" >nul 2>nul
REM Copiar package files
copy /y "%TEMP_DIR%\package.json" "package.json" >nul 2>nul
copy /y "%TEMP_DIR%\package-lock.json" "package-lock.json" >nul 2>nul

echo [4/5] Limpiando carpeta temporal...
rmdir /s /q "%TEMP_DIR%"

echo [5/5] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo WARNING: npm install tuvo advertencias, pero puede continuar
)

echo.
echo ============================================
echo   ACTUALIZACION COMPLETADA
echo ============================================
echo.
echo   Para iniciar: npm start
echo.
echo   NOTA: Tu archivo .env se conservo intacto
echo.
pause
exit /b 0

REM --- Funcion para descargar un archivo ---
:DownloadFile
set "URL=%~1"
set "DEST=%~2"
REM Crear directorio destino si no existe
powershell -Command "[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName('%DEST%'))" >nul 2>nul
REM Descargar archivo
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%URL%', '%DEST%')" 2>nul
if exist "%DEST%" (
    echo   OK: %~nx2
) else (
    echo   FALLO: %~nx2
)
exit /b 0