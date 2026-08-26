import type { DockerEngine } from '../docker/engine.ts';
import type { MeasurementCapability } from '../intake/handoff.ts';
import { tar } from '../docker/tar.ts';

/**
 * Образ, которым приёмка МОЖЕТ прогнать замер (А-44 п.1).
 *
 * **Принцип: приёмка не принимает артефакт, который она не могла произвести сама.** Живой прогон
 * А-43 три раза подряд ответил `browserType.launch: Executable doesn't exist` — приёмочный образ
 * визуального продукта не имел браузера, и замер, который она якобы прогоняла, прогонял за неё
 * исполнитель. Независимость приёмки при этом была не ослаблена, а ЛОЖНА: она принимала число,
 * которого не получала.
 *
 * Лечение ровно одно и стоит места на диске: **образ обязан уметь то, что задача требует
 * измерить**. Рост образа — названная цена независимости, а не побочный ущерб.
 *
 * Собирается контуром из Dockerfile ниже, а не тянется тегом из чужого реестра, — по тем же двум
 * доводам, что и образ исполнителя (`executor/image.ts`): публиковать его никому не надо, и версия
 * браузера становится строкой в этом репозитории, а не тем, на что указывал тег в тот день.
 *
 * Способность, которой образа нет и быть не может, — не тихий проход: задача помечается
 * «не проверяемо приёмкой» явно и уходит суду качества (см. `accept.ts`).
 */

/** Поднимать это — осознанное, отсматриваемое изменение: на нём стоит вердикт визуального замера. */
export const PLAYWRIGHT_VERSION = '1.62.1';

export const ACCEPTANCE_BROWSER_IMAGE = 'spec-platform-loop-acceptance-browser:1';

/**
 * `NODE_PATH` — не удобство, а часть способности.
 *
 * Замер лежит в копии рабочей директории, и его `require('playwright')` разрешается по её
 * `node_modules`. Копия честно несёт то, что установил исполнитель, — но браузерные ДВОИЧНЫЕ файлы
 * лежат не там, а в кеше его контейнера, которого в копии нет. Глобальная установка плюс
 * `PLAYWRIGHT_BROWSERS_PATH` дают замеру и библиотеку, и браузер, независимо от того, что осталось
 * в копии от чужой установки.
 */
export const ACCEPTANCE_BROWSER_DOCKERFILE = `
FROM node:24-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_PATH=/usr/local/lib/node_modules

# playwright ставит и свои системные зависимости (--with-deps): без них chromium запускается ровно
# так, как он запускался на живом прогоне, — никак. pixelmatch и pngjs идут рядом, потому что
# визуальный замер без сравнителя картинок — это половина замера.
RUN npm install -g playwright@${PLAYWRIGHT_VERSION} pixelmatch@7.1.0 pngjs@7.0.0 \\
 && npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \\
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
`.trimStart();

/** Контекст сборки: один файл, детерминированные байты — как у образа исполнителя. */
export function acceptanceBrowserBuildContext(): Buffer {
  return tar([{ name: 'Dockerfile', content: ACCEPTANCE_BROWSER_DOCKERFILE }]);
}

export type CapabilityImage =
  | { ok: true; image: string }
  /** Приёмка физически не может — с причиной, которую она обязана назвать вслух. */
  | { ok: false; reason: string };

/**
 * Образ под способность: `none` довольствуется образом стека, `browser` требует своего.
 *
 * Сборка идёт один раз на машину и только по требованию: проект без визуального замера не платит
 * за браузер ничем. Провал сборки — именованный отказ, а не бросок: невозможность приёмки судить
 * есть штатный исход приёмки, и он обязан доехать до суда качества словами.
 */
export async function resolveCapabilityImage(
  engine: DockerEngine,
  capability: MeasurementCapability,
  stackImage: string,
  onProgress?: (message: string) => void,
): Promise<CapabilityImage> {
  if (capability === 'none') return { ok: true, image: stackImage };

  try {
    if (await engine.hasImage(ACCEPTANCE_BROWSER_IMAGE)) {
      return { ok: true, image: ACCEPTANCE_BROWSER_IMAGE };
    }

    onProgress?.(
      `приёмочный образ с браузером ${ACCEPTANCE_BROWSER_IMAGE} не найден — собираю ` +
        `(playwright ${PLAYWRIGHT_VERSION}, chromium). Это цена независимости замера.`,
    );
    await engine.buildImage(ACCEPTANCE_BROWSER_IMAGE, acceptanceBrowserBuildContext());
    onProgress?.(`приёмочный образ с браузером ${ACCEPTANCE_BROWSER_IMAGE} готов`);

    return { ok: true, image: ACCEPTANCE_BROWSER_IMAGE };
  } catch (error) {
    return {
      ok: false,
      reason:
        `приёмочный образ с браузером не собрался: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }
}
