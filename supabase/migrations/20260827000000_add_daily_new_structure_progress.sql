-- Add daily NEW-structure tracking (mirror của daily_new_progress cho Vocabulary).
--
-- Mỗi lần một cấu trúc MỚI (chưa có user_structures / state='new') được đưa ra
-- trong phiên học, một row (user_id, day, structure_id) được upsert (idempotent)
-- để hàng đợi biết còn được phép lấy thêm bao nhiêu cấu trúc mới hôm nay.
--
-- LƯU Ý timezone: cột `day` dùng business-date key Asia/Ho_Chi_Minh
-- ("YYYY-MM-DD") — giống daily_new_progress sau migration 20260822 (KHÔNG UTC).

CREATE TABLE IF NOT EXISTS public.daily_new_structure_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day TEXT NOT NULL CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  structure_id UUID NOT NULL,
  PRIMARY KEY (user_id, day, structure_id)
);

ALTER TABLE public.daily_new_structure_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own daily new structure progress."
  ON public.daily_new_structure_progress;

CREATE POLICY "Users can manage their own daily new structure progress."
  ON public.daily_new_structure_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


CREATE INDEX IF NOT EXISTS daily_new_structure_progress_user_id_idx
  ON public.daily_new_structure_progress (user_id);

CREATE INDEX IF NOT EXISTS daily_new_structure_progress_day_idx
  ON public.daily_new_structure_progress (day);