@echo off
chcp 65001 >nul 2>nul

set REPO=https://raw.githubusercontent.com/Derlis87/rollerwin/main/roulette-capture
set TEMP_DIR=%TEMP%\roulette-capture-update

REM ============================================================
REM PASO 0: AUTO-UPDATE — descargar la ultima version de update.bat
REM Esto resuelve el problema de tener un update.bat viejo
REM ============================================================
echo ============================================
echo   ROULETTE CAPTURE — UPDATE
echo ============================================
echo.
echo [0/6] Verificando si update.bat necesita actualizacion...

set "NEW_BAT=%TEMP%\update-latest.bat"
if exist "%TEMP%" rmdir /s /q "%TEMP%"
mkdir "%TEMP%"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('%REPO%/update.bat', '%NEW_BAT%') } catch {}" 2>nul

if exist "%NEW_BAT%" (
    fc /b "%~f0" "%NEW_BAT%" >nul 2>nul
    if errorlevel 1 (
        echo   update.bat desactualizado — descargando version nueva...
        copy /y "%NEW_BAT%" "%~f0" >nul 2>nul
        echo   Reiniciando update.bat...
        rmdir /s /q "%TEMP%"
        call "%~f0"
        exit /b %errorlevel%
    ) else (
        echo   update.bat esta al dia
    )
) else (
    echo   No se pudo verificar (sin internet o repo inaccesible)
)

echo.
echo [1/6] Creando carpeta temporal...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo [2/6] Descargando archivos actualizados desde GitHub...
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
echo [3/6] Copiando archivos actualizados...
xcopy /y /q "%TEMP_DIR%\src\*" "src\" >nul 2>nul
copy /y "%TEMP_DIR%\package.json" "package.json" >nul 2>nul

REM Limpiar archivos obsoletos
echo [4/6] Limpiando archivos obsoletos...
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
echo [5/6] Verificando .env...
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

echo [6/6] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo WARNING: npm install tuvo advertencias
)

echo.
echo [LIMPIEZA] Eliminando carpeta temporal...
rmdir /s /q "%TEMP_DIR%"

echo.
echo ============================================
echo   ACTUALIZACION COMPLETADA — v5.0 OCR
echo ============================================
echo.
echo   Modo: OCR (Tesseract.js)
echo   Lee el numero visible de la pantalla
echo   Sin CDP, sin extension, sin bridge
echo.
echo   Para iniciar: npm start
echo   NOTA: Tu .env se conservo intacto
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