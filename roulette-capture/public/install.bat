@echo off
chcp 65001 >nul 2>nul
title ROULETTE CAPTURE v5.0 — INSTALADOR LIMPIO

echo.
echo  ========================================================
echo   ROULETTE CAPTURE v5.0 — INSTALADOR
echo   Modo: OCR (Tesseract.js)
echo  ========================================================
echo.
echo   INSTRUCCIONES:
echo   1. Este archivo descarga todos los archivos v5.0
echo   2. NO necesitas update.bat para la primera instalacion
echo   3. Despues de instalar, edita el archivo .env
echo   4. Luego ejecuta: npm start
echo.
echo  ========================================================
echo.

set REPO=https://raw.githubusercontent.com/Derlis87/rollerwin/main/roulette-capture

echo [1/4] Creando carpetas...
mkdir src\browser 2>nul
mkdir src\capture 2>nul
mkdir src\casinos 2>nul
mkdir src\api 2>nul
mkdir src\utils 2>nul

echo [2/4] Descargando archivos v5.0...
echo.

call :DL "%REPO%/package.json" "package.json"
call :DL "%REPO%/.env.example" ".env.example"
call :DL "%REPO%/update.bat" "update.bat"

call :DL "%REPO%/src/index.js" "src\index.js"
call :DL "%REPO%/src/config.js" "src\config.js"
call :DL "%REPO%/src/orchestrator.js" "src\orchestrator.js"

call :DL "%REPO%/src/browser/stealth.js" "src\browser\stealth.js"
call :DL "%REPO%/src/browser/human-behavior.js" "src\browser\human-behavior.js"

call :DL "%REPO%/src/capture/ocr-capture.js" "src\capture\ocr-capture.js"
call :DL "%REPO%/src/capture/number-processor.js" "src\capture\number-processor.js"

call :DL "%REPO%/src/casinos/base-casino.js" "src\casinos\base-casino.js"
call :DL "%REPO%/src/casinos/pinnacle.js" "src\casinos\pinnacle.js"
call :DL "%REPO%/src/casinos/betfury.js" "src\casinos\betfury.js"
call :DL "%REPO%/src/casinos/stake.js" "src\casinos\stake.js"

call :DL "%REPO%/src/api/rollerwin-api.js" "src\api\rollerwin-api.js"

call :DL "%REPO%/src/utils/logger.js" "src\utils\logger.js"
call :DL "%REPO%/src/utils/helpers.js" "src\utils\helpers.js"
call :DL "%REPO%/src/utils/export-cookies.js" "src\utils\export-cookies.js"

echo.
echo [3/4] Verificando .env...
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo   .env creado desde .env.example
        echo.
        echo   *** IMPORTANTE: Edita .env y pone tu CHROME_PATH ***
    ) else (
        echo   WARNING: No se pudo crear .env
    )
) else (
    echo   .env ya existe — conservado intacto
)

echo.
echo [4/4] Instalando dependencias (npm install)...
echo   Esto puede tardar 1-2 minutos la primera vez...
echo.
call npm install

echo.
echo  ========================================================
echo   INSTALACION COMPLETADA
echo  ========================================================
echo.
echo   Proximos pasos:
echo   1. Abre el archivo .env con el Bloc de Notas
echo   2. Pon la ruta a tu chrome.exe en CHROME_PATH
echo      Ejemplo: CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
echo   3. Ejecuta: npm start
echo.
echo   NOTA: La primera vez que inicies, Tesseract descargara
echo   ~15MB de datos de idioma. Eso es normal.
echo.
pause
exit /b 0

:DL
set "URL=%~1"
set "DEST=%~2"
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('%URL%', '%DEST%') } catch { Write-Host 'FALLO' }" 2>nul
if exist "%DEST%" (
    echo   OK: %~nx2
) else (
    echo   FALLO: %~nx2 — no se pudo descargar
)
exit /b 0