-- Run once, after creating Naav's user in Supabase (Authentication -> Users -> Add user,
-- with a password and "Auto confirm"). Replace the email below.
insert into public.profiles (id, email, full_name, role)
select id, email, 'Naav', 'admin'
from auth.users
where lower(email) = lower('naav@example.com')
on conflict (id) do update set role = 'admin', client_id = null;
