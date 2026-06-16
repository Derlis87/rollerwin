@echo off
echo ============================================
echo   ROULETTE CAPTURE SYSTEM - UPDATE v3.0
echo ============================================
echo.

REM Verificar que git esta disponible
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git no encontrado. Instala git desde https://git-scm.com/
    pause
    exit /b 1
)

echo [1/4] Deteniendo procesos anteriores...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Descargando actualizaciones...
git pull origin main
if %errorlevel% neq 0 (
    echo ERROR: No se pudo hacer git pull. Hace commit de tus cambios primero.
    pause
    exit /b 1
)

echo [3/4] Verificando archivos del extension...
if not exist "extension\manifest.json" (
    echo ERROR: No se encontro extension\manifest.json
    echo Asegurate de que la carpeta 'extension' existe con:
    echo   - manifest.json
    echo   - background.js
    echo   - content.js
    echo   - inject-main.js
    pause
    exit /b 1
)

echo [4/4] Instalando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install fallo
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ACTUALIZACION COMPLETADA
echo ============================================
echo.
echo   Para iniciar: npm start
echo.
echo   IMPORTANTE:
echo   - Verifica que CHROME_PATH en .env apunte a tu chrome.exe
echo   - El puerto 19555 debe estar libre
echo   - Chrome se abrira con el extension de captura
echo.
pause