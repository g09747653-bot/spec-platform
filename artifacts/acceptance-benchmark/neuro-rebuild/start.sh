#!/bin/sh
# Одно нажатие: поднимает сайт и открывает его в браузере целиком.
cd "$(dirname "$0")" || exit 1
exec node serve.js
