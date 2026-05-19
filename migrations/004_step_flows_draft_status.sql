-- step_flows.status に 'draft' を追加
-- 既存制約は 'active', 'paused' のみ → 下書き状態を持てるようにする

ALTER TABLE step_flows DROP CONSTRAINT IF EXISTS step_flows_status_check;
ALTER TABLE step_flows
  ADD CONSTRAINT step_flows_status_check
  CHECK (status IN ('active', 'paused', 'draft'));
