-- Статистика исходного сообщения и режим показа; старые публикации остаются доступны.
ALTER TABLE "Lead" ADD COLUMN "sourceEngagement" JSONB;
