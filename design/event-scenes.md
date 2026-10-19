# Сцены городских событий

Шесть отдельных изображений созданы встроенным ImageGen. Референс пользователя: мягкая трёхмерная городская сцена с фактурным асфальтом, спокойными цветами и размытым фоном. Галочки, пины, значки статуса, интерфейсные элементы и надписи исключены из всех промптов.

На сайте новые сцены находятся в `assets/events/scenes/` и показываются над заголовком «Подробности события» только в развёрнутой карточке. Маленькие существующие иллюстрации в шапке сохранены. Формат WebP, 960 × 640, качество 82; пропорции 3:2 сохраняются без обрезки. Размеры заданы в HTML, декодирование асинхронное, загрузка отложенная. Подпись обозначает иллюстративный характер картинки.

## Общий промпт

Use case: stylized-concept. Asset type: a detailed illustration for a civic event card on the blue-themed Gorod 21 website. Generate ONE finished landscape image in a 3:2 aspect ratio (1536x1024). Style: polished soft 3D miniature urban diorama, subtly rounded realistic objects, textured asphalt and plaster, clean physical materials, gentle daylight, soft ambient shadows, shallow depth of field with a hazy city background. Cool pastel blue, soft grey, white, restrained natural green accents. Three-quarter close-up perspective, composition fills the entire frame, uncluttered but clearly shows the problem. Match a friendly high-quality 3D city service illustration, not a flat icon or infographic. No text, no letters, no logos, no watermarks, no UI, no floating objects, no map pins, no circles or medallions, no checkmarks, no ticks, no success symbols, no badges, no overlays, no border or decorative frame. A physical work bollard or cone is allowed only where specified. No people. 

## Сюжеты

### Отключение воды

Файл: `assets/events/scenes/water.webp`.

A dry metal water faucet attached to a pale blue municipal supply pipe in the foreground, with an empty small galvanized bucket beneath it. A clearly closed blue shut-off valve and a tidy shallow utility access opening nearby communicate a temporary water service outage. A softly blurred apartment courtyard, pavement and small green trees in the background. No water flowing from the faucet.

### Ремонт теплосети

Файл: `assets/events/scenes/heating.webp`.

District heating repair in an apartment courtyard: a shallow rectangular open utility trench across grey pavement, containing a large insulated heating pipe. One section of the insulation is opened to expose a damaged pipe joint with a small wisp of steam; a replacement pipe section and a wrench lie neatly beside the trench. One slim physical red-and-white work bollard at the edge. Softly blurred trees and apartment buildings behind.

### Ремонт освещения

Файл: `assets/events/scenes/lighting.webp`.

A broken blue-grey streetlight beside a city sidewalk: its open tilted lamp housing has a visibly damaged unlit bulb and the small service panel at the pole base is open. A compact tool case and one small physical work cone sit at the base. In the softly blurred background there is a second working lamp with a subtle warm light, trees and low apartment silhouettes. Cool soft early-evening lighting, the damaged streetlight is clearly the subject.

### Ремонт дороги

Файл: `assets/events/scenes/road.webp`.

Road resurfacing beside a neat grey curb and pale tiled sidewalk. A rectangular section of dark asphalt has been cut away, exposing a coarse gravel base, with a few broken asphalt pieces and a flat shovel beside it. A single narrow physical red-and-white roadwork bollard stands beside the cut. Partial white road markings continue on the intact road. Softly blurred green trees, grass and apartment silhouettes in the background.

### Граффити на фасаде здания

Файл: `assets/events/scenes/graffiti.webp`.

A small section of an apartment building facade next to a grey tiled sidewalk. The pale blue-white plaster wall has conspicuous blue and violet spray-painted illegible curved graffiti scribbles, clearly showing defacement. A normal simple apartment window above, a downpipe at the side, and a small green shrub. The paint has natural overspray, but forms no letters, words, symbols, ticks or checkmarks. Softly blurred courtyard greenery in the background.

### Оледенение дороги

Файл: `assets/events/scenes/ice.webp`.

A grey neighborhood road covered by a conspicuous thin smooth sheet of pale blue ice, with subtle frozen tire tracks and a glossy slippery sheen. Curbs and a pale tiled sidewalk frame the road. Small snow and frost patches beside the curb, a few softly blurred winter trees and apartment building silhouettes in the background. The ice surface in the foreground is the clear visual focus. No road signs or floating warning symbols.


## Карусель граффити «До / После»

Для сценария a1 исходная сцена заменена каруселью из двух изображений. «До» — прикреплённая пользователем фотография `image(20261019-095910).png` с граффити. «После» создано встроенным ImageGen редактированием этой фотографии: удалены граффити, сохранены фасад, ракурс и обстановка. Изображения сохранены как `assets/events/scenes/graffiti-before.webp` и `assets/events/scenes/graffiti-after.webp`, 960 × 720, WebP, качество 84. Первым всегда показывается «До». Доступны нативная горизонтальная прокрутка, свайп, кнопки, индикаторы и клавиши ← / →, Home / End. Автопрокрутки нет. Пять остальных сценариев не менялись. Старый файл `graffiti.webp` сохранён как предыдущий вариант и в текущей карточке не используется.

### Промпт редактирования

Use case: precise-object-edit. Input image is the EDIT TARGET, not just a style reference. Create the AFTER-cleaning version of this exact photograph. Change ONLY the graffiti painted across the lower white-painted brick wall: remove all purple, maroon, red-purple, orange, pale-blue and white graffiti strokes and paint drips, replacing that painted region with natural clean white-painted bricks and matching grey mortar seams continuous with the surrounding wall. Preserve the original brick texture and mild wear. Preserve exactly the camera viewpoint, 4:3 framing, perspective, all brick positions, the existing unpainted red brick areas at the very top, the windows and their dark rusty metal security frames, the foliage and tree branch at upper right, all weeds and plants across the bottom, the concrete strip, lighting, shadows and color balance. Do not erase the real red brick accents above the white-painted part. Do not add or move any objects. Do not crop or zoom. No new text, no checkmarks, no ticks, no badge, no map pins, no before/after labels, no watermark. Output a single clean-wall image with the same 4:3 aspect ratio, preferably 1280x960.

## Фотографии событий со статусом «В работе»

19 октября 2026 года три иллюстрации заменены фотографиями, предоставленными пользователем. Каждое событие показывает одно изображение над «Подробности события»:

| Событие | Исходное фото | Файл на сайте | Размер |
| --- | --- | --- | --- |
| Ремонт освещения (a2) | `image(20261019-134953).png` — мастер на подъёмнике у фонаря | `assets/events/scenes/lighting.webp` | 960 × 594 |
| Оледенение дороги (g2) | `image(20261019-135309).png` — обработка дороги противогололёдным материалом | `assets/events/scenes/ice.webp` | 960 × 539 |
| Ремонт теплосети (u2) | `image(20261019-135624).png` — рабочие ремонтируют трубы в траншее | `assets/events/scenes/heating.webp` | 900 × 600 |

Фотографии не генерировались и не кадрировались. Они оптимизированы в WebP (качество 85), без увеличения исходного разрешения. В HTML заданы их фактические размеры и пропорции. Подпись сохраняет иллюстративный характер фотографий; они не подтверждают выполнение работ по указанным адресам. Сцены запланированных событий и карусель граффити «До / После» сохранены.

## Запланированные события: изображения отсутствуют

Для всех событий со статусом `planned` (отключение воды u1 и ремонт дороги g1) вместо сцены показывается пустой блок с прежними пропорциями 3:2. В центре — восклицательный знак и текст «Изображения отсутствуют». Под блоком размещена подпись: «Изображения появятся, как только объект перейдет в стадию выполнения работ.». Изображение сцены для такого события не загружается. Маленькие иконки типов событий в шапке сохранены. Отображение фотографий событий в работе и карусели выполненного события не менялось.
