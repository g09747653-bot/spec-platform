<#
.NOTES
    Файл сохранён в UTF-8 **с BOM** намеренно: Windows PowerShell 5.1 читает .ps1 без BOM как ANSI,
    и русские строки в нём превращаются в мусор, на котором парсер падает ещё до первого замера.
    Проверено на машине заказчика.

.SYNOPSIS
    Пиковое потребление видеопамяти за время прогона (задача 162; бандл A0 Success Criteria).

.DESCRIPTION
    Опрашивает `nvidia-smi` каждые 500 мс и пишет две вещи: построчный лог замеров и итог с пиком.
    Ничего не останавливает и ни во что не вмешивается — это аудит, а не контроль.

    **Почему только гейт, а не рантайм.** Бандл A0 противоречит сам себе: его NFR запрещает
    программный контроль VRAM, а Success Criteria требует скрипт. Противоречие снято решением
    А-20 п.3(г): аудит живёт отдельным скриптом, который запускает ГЕЙТ на машине заказчика
    параллельно прогону, а контур в рантайме видеопамять не полисит. CI без GPU — именованное
    ограничение: там этот скрипт не запускается вовсе, и это записано, а не забыто.

    Порог 12288 МБ — из бандла. Он не убивает и не тормозит: превышение отмечается в логе и
    в итоге, чтобы гейт мог сказать «пик был выше порога», а решение принимал человек.

.PARAMETER Out
    Куда писать. Создаются два файла: `<Out>` (JSON с итогом) и `<Out>.log` (построчные замеры).

.PARAMETER IntervalMs
    Шаг опроса. 500 мс — из бандла.

.PARAMETER ThresholdMb
    Порог для отметки в отчёте. 12288 МБ — из бандла.

.PARAMETER StopFile
    Путь, появление которого завершает опрос. Ctrl+C тоже работает, но убитый процесс итога не
    пишет — а гейт запускает монитор из скрипта и должен получить замер, а не пустоту. Файл-стоп
    даёт нормальный выход: цикл видит файл, выходит, `finally` пишет итог.

.EXAMPLE
    # В отдельном терминале, до старта прогулки гейта:
    pwsh -File loop/scripts/vram_monitor.ps1 -Out artifacts/gate-M16a/vram.json
    # Остановить: Ctrl+C — итог пишется на выходе.
#>
[CmdletBinding()]
param(
    [string]$Out = 'artifacts/vram.json',
    [int]$IntervalMs = 500,
    [int]$ThresholdMb = 12288,
    [string]$StopFile = ''
)

$ErrorActionPreference = 'Stop'

$directory = Split-Path -Parent $Out
if ($directory -and -not (Test-Path $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$logPath = "$Out.log"
$nvidiaSmi = (Get-Command nvidia-smi -ErrorAction SilentlyContinue)

if ($null -eq $nvidiaSmi) {
    # Машина без GPU — именованное ограничение, а не сбой: отчёт это и говорит.
    $absent = [ordered]@{
        available   = $false
        reason      = 'nvidia-smi не найден — на этой машине аудит VRAM недоступен'
        peakMb      = $null
        thresholdMb = $ThresholdMb
        samples     = 0
    }
    $absent | ConvertTo-Json | Out-File -FilePath $Out -Encoding utf8
    Write-Output "nvidia-smi не найден; записано $Out"
    exit 0
}

$peak = 0
$samples = 0
$exceeded = 0
$started = Get-Date

"# VRAM audit started $($started.ToString('o')); interval ${IntervalMs}ms; threshold ${ThresholdMb}MB" |
    Out-File -FilePath $logPath -Encoding utf8

# Итог пишется и по Ctrl+C, и по нормальному выходу: прогулка не должна остаться без замера.
try {
    while ($true) {
        if ($StopFile -and (Test-Path $StopFile)) { break }

        $raw = & nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits
        $samples++

        foreach ($line in @($raw)) {
            $parts = $line -split ',\s*'
            $used = [int]$parts[0]

            if ($used -gt $peak) { $peak = $used }
            if ($used -ge $ThresholdMb) { $exceeded++ }

            "$((Get-Date).ToString('HH:mm:ss.fff')) used=${used}MB total=$($parts[1])MB" |
                Add-Content -Path $logPath -Encoding utf8
        }

        Start-Sleep -Milliseconds $IntervalMs
    }
}
finally {
    $summary = [ordered]@{
        available     = $true
        startedAt     = $started.ToString('o')
        endedAt       = (Get-Date).ToString('o')
        durationSec   = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        intervalMs    = $IntervalMs
        samples       = $samples
        peakMb        = $peak
        thresholdMb   = $ThresholdMb
        overThreshold = ($peak -ge $ThresholdMb)
        samplesOver   = $exceeded
        log           = $logPath
    }

    $summary | ConvertTo-Json | Out-File -FilePath $Out -Encoding utf8
    Write-Output "Пик VRAM: ${peak}MB за $samples замер(ов); итог в $Out"
}
