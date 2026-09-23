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

export type ThemePresentation = {
  feedTitle: string;
  searchPlaceholder: string;
  emptyTitle: string;
  refreshLabel: string;
  allCategoriesLabel: string;
  actionLabel: string;
  cardIntro: string;
};

const THEME_PRESENTATIONS: Record<ApplicationThemeId, ThemePresentation> = {
  news: { feedTitle: 'Новости', searchPlaceholder: 'Поиск новостей…', emptyTitle: 'Новых публикаций пока нет', refreshLabel: 'Обновить новости', allCategoriesLabel: 'Все рубрики', actionLabel: 'Открыть новость', cardIntro: 'Новости из выбранных источников' },
  jobs: { feedTitle: 'Вакансии', searchPlaceholder: 'Поиск вакансий…', emptyTitle: 'Новых вакансий пока нет', refreshLabel: 'Обновить вакансии', allCategoriesLabel: 'Все направления', actionLabel: 'Получить контакт', cardIntro: 'Работа и подработка' },
  orders: { feedTitle: 'Заказы', searchPlaceholder: 'Поиск заказов…', emptyTitle: 'Новых заказов пока нет', refreshLabel: 'Обновить заказы', allCategoriesLabel: 'Все виды заказов', actionLabel: 'Получить контакт', cardIntro: 'Заявки клиентов' },
  property: { feedTitle: 'Недвижимость', searchPlaceholder: 'Поиск объектов…', emptyTitle: 'Новых объявлений пока нет', refreshLabel: 'Обновить объявления', allCategoriesLabel: 'Все объекты', actionLabel: 'Связаться с автором', cardIntro: 'Аренда и недвижимость' },
  goods: { feedTitle: 'Товары', searchPlaceholder: 'Поиск товаров…', emptyTitle: 'Новых предложений пока нет', refreshLabel: 'Обновить товары', allCategoriesLabel: 'Все товары', actionLabel: 'Связаться с продавцом', cardIntro: 'Предложения товаров' },
  commerce: { feedTitle: 'Коммерция', searchPlaceholder: 'Поиск предложений…', emptyTitle: 'Новых предложений пока нет', refreshLabel: 'Обновить предложения', allCategoriesLabel: 'Все направления', actionLabel: 'Получить контакт', cardIntro: 'Коммерческие предложения' },
  services: { feedTitle: 'Услуги', searchPlaceholder: 'Поиск услуг…', emptyTitle: 'Новых предложений пока нет', refreshLabel: 'Обновить услуги', allCategoriesLabel: 'Все услуги', actionLabel: 'Связаться с исполнителем', cardIntro: 'Услуги специалистов' },
  events: { feedTitle: 'События и отдых', searchPlaceholder: 'Поиск событий…', emptyTitle: 'Новых событий пока нет', refreshLabel: 'Обновить события', allCategoriesLabel: 'Все события', actionLabel: 'Подробнее', cardIntro: 'События и отдых' },
  free: { feedTitle: 'Отдам даром', searchPlaceholder: 'Поиск вещей…', emptyTitle: 'Новых публикаций пока нет', refreshLabel: 'Обновить публикации', allCategoriesLabel: 'Все рубрики', actionLabel: 'Посмотреть', cardIntro: 'Бесплатные предложения' },
};

export function themePresentation(theme: unknown): ThemePresentation {
  return isApplicationThemeId(theme) ? THEME_PRESENTATIONS[theme] : THEME_PRESENTATIONS.orders;
}
