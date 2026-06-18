@echo off
chcp 65001 >nul 2>nul
echo ============================================
echo   ROULETTE CAPTURE v5.0 — UPDATE
echo   Modo: OCR (Tesseract.js)
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

REM --- Capture (OCR) ---
call :DownloadFile "%REPO%/src/capture/ocr-capture.js" "%TEMP_DIR%\src\capture\ocr-capture.js"
call :DownloadFile "%REPO%/src/capture/number-processor.js" "%TEMP_DIR%\src\capture\number-processor.js"

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

REM --- Package ---
call :DownloadFile "%REPO%/package.json" "%TEMP_DIR%\package.json"

REM --- .env.example ---
call :DownloadFile "%REPO%/.env.example" "%TEMP_DIR%\.env.example"

echo.
echo [3/5] Copiando archivos actualizados...
xcopy /y /q "%TEMP_DIR%\src\*" "src\" >nul 2>nul
copy /y "%TEMP_DIR%\package.json" "package.json" >nul 2>nul

REM Limpiar archivos obsoletos de versiones anteriores
echo [3.5/5] Limpiando archivos obsoletos...
if exist "extension\" (
    rmdir /s /q "extension\" >nul 2>nul
    echo   Eliminado: extension\
)
if exist "src\capture\cdp-inject.js" (
    del /q "src\capture\cdp-inject.js" >nul 2>nul
    echo   Eliminado: cdp-inject.js
)
if exist "src\capture\extension-bridge.js" (
    del /q "src\capture\extension-bridge.js" >nul 2>nul
    echo   Eliminado: extension-bridge.js
)
if exist "src\capture\ws-interceptor.js" (
    del /q "src\capture\ws-interceptor.js" >nul 2>nul
    echo   Eliminado: ws-interceptor.js
)
if exist "src\capture\inject-capture.js" (
    del /q "src\capture\inject-capture.js" >nul 2>nul
    echo   Eliminado: inject-capture.js
)
if exist "package-lock.json" (
    del /q "package-lock.json" >nul 2>nul
)

echo.
echo [3.7/5] Verificando .env...
if not exist ".env" (
    if exist "%TEMP_DIR%\.env.example" (
        copy /y "%TEMP_DIR%\.env.example" ".env" >nul 2>nul
        echo   Creado .env desde .env.example — EDITA CHROME_PATH!
    ) else (
        echo   WARNING: No se encontro .env.example
    )
) else (
    echo   .env existe — conservado intacto
)

echo [4/5] Limpiando carpeta temporal...
rmdir /s /q "%TEMP_DIR%"

echo [5/5] Instalando dependencias (tesseract.js)...
call npm install
if %errorlevel% neq 0 (
    echo WARNING: npm install tuvo advertencias, pero puede continuar
)

echo.
echo ============================================
echo   ACTUALIZACION v5.0 COMPLETADA
echo ============================================
echo.
echo   Cambios:
echo   - OCR reemplaza CDP Injection (mas simple y confiable)
echo   - Tesseract.js lee el numero de la pantalla
echo   - Ya no necesita bridge ni extension
echo   - Archivos obsoletos eliminados
echo.
echo   Para iniciar: npm start
echo   NOTA: Tu archivo .env se conservo intacto
echo   TIP: Ajusta OCR_CROP_X/Y/W/H en .env si no detecta el numero
echo.
pause
exit /b 0

REM --- Funcion para descargar un archivo ---
:DownloadFile
set "URL=%~1"
set "DEST=%~2"
powershell -Command "[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName('%DEST%'))" >nul 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%URL%', '%DEST%')" 2>nul
if exist "%DEST%" (
    echo   OK: %~nx2
) else (
    echo   FALLO: %~nx2
)
exit /b 0