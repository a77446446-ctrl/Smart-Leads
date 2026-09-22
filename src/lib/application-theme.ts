export const APPLICATION_THEME_SETTING_KEY = 'application_theme';

// Единый справочник для проверки на сервере и подсказок в административной панели.
export const APPLICATION_THEMES = [
  { id: 'news', name: 'Новости', categories: ['Спорт', 'Авто', 'Город'], example: 'Спорт', plus: 'футбол, хоккей, турнир', minus: 'ставки, букмекер' },
  { id: 'jobs', name: 'Работа', categories: ['Вакансии', 'Подработка', 'Удалённая работа'], example: 'Вакансии водителей', plus: 'требуется водитель, вакансия водителя', minus: 'ищу работу, резюме' },
  { id: 'orders', name: 'Заказы', categories: ['Ремонт', 'Перевозки', 'Строительство'], example: 'Ремонт квартир', plus: 'нужен мастер, ищу бригаду', minus: 'предлагаю услуги, выполню ремонт' },
  { id: 'property', name: 'Аренда и недвижимость', categories: ['Аренда квартир', 'Продажа жилья', 'Коммерческие помещения'], example: 'Продажа коммерческих помещений', plus: 'продам помещение, продажа офиса', minus: 'сниму, аренда' },
  { id: 'goods', name: 'Товары', categories: ['Электроника', 'Мебель', 'Одежда'], example: 'Мебель', plus: 'продам диван, продам шкаф', minus: 'куплю, ищу' },
  { id: 'commerce', name: 'Коммерция', categories: ['Опт', 'Оборудование', 'Готовый бизнес'], example: 'Оптовые предложения', plus: 'оптом, оптовая поставка', minus: 'розница, поштучно' },
  { id: 'services', name: 'Услуги', categories: ['Ремонт техники', 'Уборка', 'Обучение'], example: 'Уборка', plus: 'клининг, уборка квартир', minus: 'вакансия, требуется уборщица' },
  { id: 'events', name: 'События и отдых', categories: ['Концерты', 'Выставки', 'Экскурсии'], example: 'Концерты', plus: 'концерт, выступление', minus: 'отмена, отменён' },
  { id: 'free', name: 'Отдам даром', categories: ['Вещи', 'Мебель', 'Детские товары'], example: 'Мебель бесплатно', plus: 'отдам даром, отдам бесплатно', minus: 'продам, куплю' },
] as const;

export type ApplicationThemeId = typeof APPLICATION_THEMES[number]['id'];

export function isApplicationThemeId(value: unknown): value is ApplicationThemeId {
  return typeof value === 'string' && APPLICATION_THEMES.some(theme => theme.id === value);
}

export function parseApplicationTheme(input: unknown): ApplicationThemeId {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Выберите одну тему приложения.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !isApplicationThemeId(body.theme)) throw new Error('Выберите одну тему из списка.');
  return body.theme;
}
