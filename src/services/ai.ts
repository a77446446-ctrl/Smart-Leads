import { redactContactInfo } from '@/lib/redact-contact';
import { buildLeadTitle } from '@/lib/lead-title';
import { classifyLeadCategory, type LeadCategoryMatch, type LeadCategoryRule } from '@/lib/lead-category';
import { prisma } from '@/lib/prisma';
import { cleanLeadText } from '@/lib/lead-content';
import { detectLeadSpam, hasVacancyIntent } from '@/lib/lead-moderation';

export interface RawLead {
  text: string;
  source?: string;
}

export interface ProcessedLead {
  title: string;
  category: string;
  city: string;
  budget: string;
  score: number;
  isSpam: boolean;
  categoryMatched: boolean;
  cleanedText?: string;
}

// Функция для очистки текста от технического мусора из интерфейса мессенджера
function cleanRawText(text: string): string {
  return cleanLeadText(text);
}

// Вспомогательная функция локального парсинга без ИИ
function fallbackScriptParse(
  rawText: string,
  categories: LeadCategoryRule[],
  categoryMatch: LeadCategoryMatch = classifyLeadCategory(rawText, categories),
): ProcessedLead {
  const lowerText = rawText.toLowerCase();

  // Базовый антиспам теперь проверяется глобально в processLead перед вызовом fallbackScriptParse
  const isSpam = false;

  // 2. Расширенный список городов России (с использованием границ слов \b для коротких аббревиатур)
  const cities: Record<string, RegExp[]> = {
    'Москва': [/москв/i, /\bмск\b/i, /химки/i, /люберц/i, /мытищ/i, /подольск/i, /балаших/i, /одинцово/i, /зеленоград/i, /красногорск/i, /видное/i, /реутов/i],
    'Санкт-Петербург': [/санкт-петербург/i, /\bспб\b/i, /\bпитер/i, /ленинград/i, /парголово/i, /мурино/i, /кудрово/i, /шушар/i, /колпино/i, /пушкин/i, /петергоф/i, /кронштадт/i, /сестрорецк/i, /янино/i],
    'Новосибирск': [/новосибирск/i, /\bнск\b/i],
    'Екатеринбург': [/екатеринбург/i, /\bекб\b/i],
    'Казань': [/казан/i],
    'Нижний Новгород': [/нижни.*новгород/i, /\bнн\b/i],
    'Тюмень': [/тюмен/i],
    'Краснодар': [/краснодар/i, /\bкрд\b/i],
    'Сочи': [/сочи/i],
    'Ростов-на-Дону': [/ростов/i, /\bрнд\b/i],
    'Уфа': [/\bуфа\b/i, /\bуфу\b/i, /\bуфе\b/i],
    'Самара': [/самар/i],
    'Челябинск': [/челябинск/i, /\bчел\b/i],
    'Омск': [/\bомск/i],
    'Красноярск': [/красноярск/i, /\bкрск\b/i],
    'Воронеж': [/воронеж/i],
    'Пермь': [/перм/i],
    'Волгоград': [/волгоград/i, /\bвлг\b/i],
    'Саратов': [/саратов/i],
    'Тольятти': [/тольятти/i, /\bтлт\b/i],
    'Ижевск': [/ижевск/i],
    'Барнаул': [/барнаул/i, /\bбрн\b/i],
    'Ульяновск': [/ульяновск/i, /\bулск\b/i],
    'Иркутск': [/иркутск/i, /\bирк\b/i],
    'Хабаровск': [/хабаровск/i, /\bхбр\b/i],
    'Ярославль': [/ярославл/i],
    'Владивосток': [/владивосток/i, /\bвдк\b/i, /\bвл\b/i],
    'Махачкала': [/махачкал/i],
    'Томск': [/томск/i],
    'Оренбург': [/оренбург/i],
    'Кемерово': [/кемеров/i],
    'Новокузнецк': [/новокузнецк/i, /\bнкз\b/i],
    'Рязань': [/рязан/i],
    'Астрахань': [/астрахан/i],
    'Набережные Челны': [/набережн.*челн/i, /\bчелн/i],
    'Пенза': [/пенз/i],
    'Липецк': [/липецк/i],
    'Киров': [/киров/i]
  };
  
  let detectedCity = 'Не указан'; // Если город не найден, лучше ставить "Не указан"
  for (const [city, regexes] of Object.entries(cities)) {
    if (regexes.some(regex => regex.test(lowerText))) {
      detectedCity = city;
      break;
    }
  }

  // Заголовок строится по смысловой фразе и никогда не обрывается посреди слова.
  const title = buildLeadTitle(rawText);

  return {
    title,
    category: categoryMatch.categorySlug,
    city: detectedCity,
    budget: 'По договоренности',
    score: isSpam ? 0 : 80,
    isSpam,
    categoryMatched: categoryMatch.matched,
    cleanedText: cleanRawText(rawText)
  };
}

export const aiService = {
  processLead: async (rawText: string): Promise<ProcessedLead> => {
    try {
      rawText = cleanLeadText(rawText);
      // 0. Глобальный антиспам (проверяется ДО любых ИИ или запасных скриптов)
      const spamSettings = await prisma.setting.findUnique({
        where: { key: 'maks_spam_keywords' }
      });
      const customSpam = spamSettings?.value || '';
      
      if (detectLeadSpam(rawText, customSpam)) {
         console.log('Антиспам: найдено запрещённое содержание или стоп-фраза.');
         return {
            title: buildLeadTitle(rawText),
            category: 'other',
            city: 'Не определен',
            budget: '',
            score: 0,
            isSpam: true,
            categoryMatched: false,
            cleanedText: cleanRawText(rawText)
         };
      }

      // 1. Fetch active categories and keywords from DB
      const dbCategories = await prisma.category.findMany({
        where: { active: true }
      });
      const categoryMatch = classifyLeadCategory(rawText, dbCategories);

      if (dbCategories.length === 0) {
        return fallbackScriptParse(rawText, [], categoryMatch);
      }

      // 2. Проверяем, включен ли ИИ вообще
      const aiEnabledSetting = await prisma.setting.findUnique({
        where: { key: 'maks_ai_enabled' }
      });
      const isAiEnabled = aiEnabledSetting?.value === 'true';

      if (!isAiEnabled) {
        console.log('AI is disabled (Feature Toggle). Using local script parser.');
        return fallbackScriptParse(rawText, dbCategories, categoryMatch);
      }

      console.log('AI is processing lead with DeepSeek (Dynamic Categories)');

      const aiKeySetting = await prisma.setting.findUnique({
        where: { key: 'maks_ai_api_key' }
      });
      const dbApiKey = aiKeySetting?.value?.trim();

      const categoriesList = dbCategories.map(c => 
        `ID: "${c.slug}" (Имя: ${c.name}, Ключи: ${c.plusKeywords || 'любые'})`
      ).join('\n');

      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const hasDbKey = !!dbApiKey;
          const isOpenAIEnv = !!process.env.OPENAI_API_KEY;
          const apiKey = dbApiKey || (isOpenAIEnv ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY);
          const isOpenAI = !dbApiKey && isOpenAIEnv; 
          const apiUrl = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
          const modelName = isOpenAI ? 'gpt-4o-mini' : 'deepseek-chat';

          const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(apiUrl, {
              signal: controller.signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              temperature: 0.1, // Строгое соответствие
              messages: [
                {
                  role: 'system',
                  content: `Ты модератор лидов. Выдай только JSON.
КАТЕГОРИИ:
${categoriesList}

ПРАВИЛА:
1. category: ID подходящей категории из списка (или 'other').
2. title: Суть работы (без шапок, без воды). Пример: "Бригада кровельщиков", "Грузчики на склад". Максимум 4-6 слов.
3. city: Точный город, метро, район, поселок или улица из текста (например: "Санкт-Петербург", "Парголово", "метро Автово"). Если это пригород (Мурино, Химки) — обязательно укажи его, либо главный город (СПБ/Москва). Не пиши "НЕ УКАЗАН", если есть хоть какой-то адрес. Если вообще никаких гео-данных нет - пиши "НЕ УКАЗАН".
4. budget: Зарплата (или 'По договоренности').
5. isSpam: true, ТОЛЬКО ЕСЛИ это реклама чужого канала/бота, казино, ставки, или спам. ВАЖНО: ВАКАНСИИ (поиск сотрудников) И РЕАЛЬНАЯ РАБОТА = false!
6. score: 90 если есть контакты, иначе 70.`
                },
                {
                  role: 'user',
                  content: cleanRawText(rawText)
                }
              ]
            })
          });

          if (!response.ok) {
             const errText = await response.text();
             console.error(`API Error ${response.status}: ${errText}`);
             throw new Error(`API returned ${response.status}: ${errText.substring(0, 50)}...`);
          }

          const data = await response.json();
          let content = data.choices[0].message.content;
          
          if (content.includes('```json')) {
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
          }
          
          const result = JSON.parse(content);
          
          return {
            title: buildLeadTitle(rawText, result.title),
            // ИИ теперь сам определяет категорию на основе контекста
            category: result.category && result.category !== 'other' ? result.category : categoryMatch.categorySlug,
            city: result.city || 'НЕ УКАЗАН',
            budget: result.budget || 'По договоренности',
            score: result.score || 70,
            isSpam: result.isSpam === true && !hasVacancyIntent(rawText),
            categoryMatched: categoryMatch.matched,
            cleanedText: cleanRawText(rawText) // Не тратим токены ИИ на очистку, чистим скриптом
          };
        } catch (error) {
          attempts++;
          console.error(`DeepSeek API Attempt ${attempts} failed:`, error);
          if (attempts < maxAttempts) {
             await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      console.warn('DeepSeek attempts exhausted. Falling back to script parser.');
      return fallbackScriptParse(rawText, dbCategories, categoryMatch);
    } catch (error: any) {
      console.error('AI Pipeline Fatal Error:', error);
      throw new Error(`AI Pipeline Error: ${error.message || 'Unknown'}`);
    }
  }
};

