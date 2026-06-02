@echo off
chcp 65001 >nul
title 🍅 Tomato Clock

echo ========================================
echo   🍅 Tomato Clock - 待办清单 + 番茄钟
echo ========================================
echo.
echo  正在启动桌面小组件...
echo  提示：首次启动可能需要几秒钟
echo  关闭此窗口即可退出应用
echo.

cd /d "%~dp0"

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo  [安装] 首次运行，正在安装依赖...
    call npm install
    echo.
)

:: 启动应用
npm start

:: 如果用户关闭了 Electron 窗口，脚本也会结束
echo.
echo  应用已关闭。
pause
