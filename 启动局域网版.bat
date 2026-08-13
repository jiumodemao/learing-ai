@echo off
chcp 65001 >nul
title 多AI 局域网版
cd /d %~dp0
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else (
  if exist "E:\node\node.exe" (
    "E:\node\node.exe" server.js
  ) else (
    echo 找不到 node.exe，请确认已安装 Node.js 或修改本脚本中的路径。
  )
)
pause
