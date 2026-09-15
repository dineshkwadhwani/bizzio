-- Add the work-location field used when employees check in.
-- Run this once in Supabase SQL Editor on the existing Bizzio project.
do $$
begin
  create type attendance_work_location as enum ('designated_office', 'home', 'other_location');
exception
  when duplicate_object then null;
end $$;

alter table attendance
  add column if not exists work_location attendance_work_location;
