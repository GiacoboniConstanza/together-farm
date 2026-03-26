-- Nombre opcional de la mascota por granja
alter table public.pets
  add column if not exists name text not null default '';

alter table public.pets
  drop constraint if exists pets_name_len;

alter table public.pets
  add constraint pets_name_len check (char_length(name) <= 40);
