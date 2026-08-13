@echo off
chcp 65001 >nul
title 多AI 局域网版
cd /d %~dp0
node server.js
pause
