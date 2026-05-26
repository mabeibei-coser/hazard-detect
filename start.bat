@echo off
echo ========================================
echo   安全隐患识别系统
echo ========================================
echo.
echo 启动前端服务...
cd /d "%~dp0client"
call npm run dev
pause
