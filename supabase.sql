-- Run this in Supabase Dashboard > SQL Editor.
create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'اثر بدون عنوان',
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.artworks enable row level security;

create policy "Anyone can read published gallery artworks"
on public.artworks for select using (true);

create policy "Users can add their own artworks"
on public.artworks for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their own artworks"
on public.artworks for delete to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artworks', 'artworks', true, 10485760, array['image/svg+xml'])
on conflict (id) do nothing;

create policy "Public can view artwork files"
on storage.objects for select using (bucket_id = 'artworks');

create policy "Authenticated users can upload their own artwork files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'artworks'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own artwork files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'artworks'
  and (storage.foldername(name))[1] = auth.uid()::text
);
