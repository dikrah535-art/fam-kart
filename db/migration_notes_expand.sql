-- FamKart: allow more than 3 note slots per day
alter table public.notebook_notes drop constraint if exists notebook_notes_slot_index_check;
alter table public.notebook_notes add constraint notebook_notes_slot_index_check
  check (slot_index >= 0);
