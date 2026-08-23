# Вердикт приёмки задачи WA04: НЕ ПРИНЯТА

Это вердикт предыдущей итерации этой же задачи. Прочитай его до работы: повтор обязан
починить именно названную причину. «SUCCESS» без единой правки при этом вердикте будет
отвергнут по имени, третьего одинакового захода не будет.

## Причина

Приёмочный прогон «node tools/build.js && node tools/visual-diff/capture.js && node tools/visual-diff/compare.js» в чистом контейнере вернул 1 — задача не принята.

## Хвост вывода приёмочного прогона

```
FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=768 scrollY=8192] SC-001=FAIL (37.368% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-8076 clone=0 diff=8076.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=768 scrollY=9216] SC-001=FAIL (9.844% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-9100 clone=0 diff=9100.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=768 scrollY=10240] SC-001=FAIL (7.461% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-10124 clone=0 diff=10124.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)

=== page=products width=1440 ===
  [page=products width=1440 scrollY=0] SC-001=FAIL (43.119% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=167 clone=0 diff=167.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=900] SC-001=FAIL (16.712% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-770 clone=0 diff=770.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=1800] SC-001=FAIL (29.129% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-1670 clone=0 diff=1670.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=2700] SC-001=FAIL (21.562% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-2570 clone=0 diff=2570.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=3600] SC-001=FAIL (38.283% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-3470 clone=0 diff=3470.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=4500] SC-001=FAIL (26.097% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-4370 clone=0 diff=4370.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=5400] SC-001=FAIL (36.049% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-5270 clone=0 diff=5270.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=6300] SC-001=FAIL (26.961% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-6170 clone=0 diff=6170.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=7200] SC-001=FAIL (17.470% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-7070 clone=0 diff=7070.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)
  [page=products width=1440 scrollY=8100] SC-001=FAIL (13.251% <= 1%) | SC-002=FAIL (2 отступ(ов) превышают 2px)
      FAIL SC-002 header.top: baseline=-7970 clone=0 diff=7970.00px (> 2px)
      FAIL SC-002 header.height: baseline=0 clone=69 diff=69.00px (> 2px)

--- WARNINGS ---
WARNING: полная высота страницы клона и оригинала не совпадает для page="index" width=768: maxScrollY(baseline)=8192, maxScrollY(clone)=9216. Сравниваются только сегменты со scrollY в диапазоне [0, 8192]. Расхождение требует ручной документации в DEVIATIONS.md (см. T021/T029).
WARNING: полная высота страницы клона и оригинала не совпадает для page="index" width=1440: maxScrollY(baseline)=8100, maxScrollY(clone)=7200. Сравниваются только сегменты со scrollY в диапазоне [0, 7200]. Расхождение требует ручной документации в DEVIATIONS.md (см. T021/T029).
WARNING: полная высота страницы клона и оригинала не совпадает для page="products" width=375: maxScrollY(baseline)=17864, maxScrollY(clone)=12992. Сравниваются только сегменты со scrollY в диапазоне [0, 12992]. Расхождение требует ручной документации в DEVIATIONS.md (см. T021/T029).
WARNING: полная высота страницы клона и оригинала не совпадает для page="products" width=768: maxScrollY(baseline)=13312, maxScrollY(clone)=10240. Сравниваются только сегменты со scrollY в диапазоне [0, 10240]. Расхождение требует ручной документации в DEVIATIONS.md (см. T021/T029).
WARNING: полная высота страницы клона и оригинала не совпадает для page="products" width=1440: maxScrollY(baseline)=13500, maxScrollY(clone)=8100. Сравниваются только сегменты со scrollY в диапазоне [0, 8100]. Расхождение требует ручной документации в DEVIATIONS.md (см. T021/T029).

--- SUMMARY ---
{
  "totalSegments": 71,
  "passedSegments": 0,
  "failedSegments": 71,
  "warningsCount": 5,
  "fatalErrorsCount": 0
}

Отчёт сохранён: /workspace/tools/visual-diff/report.json
```
