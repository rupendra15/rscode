-- Internal Vistaar test accounts.
-- Both use password: admin123
-- Business owners do not use these accounts.
insert into app_users (name,email,password_hash,password_salt,role,status)
values
('Vistaar Admin','admin@vistaar.biz','2851fb54ccdb9d19018c0f6c41476b63aeecd2f892c5c581042c81cc78a10eab80735bb29abd164f46fc4dee3ae9d0c2dc147a9d46fbe4b51014a6e40a27c65d','10b78df17218f021ac72d278b865ae6f','admin','active'),
('Vistaar Manager','manager@vistaar.biz','788a5b76bdfe9d2c228eb07a012bebb850d0ee8cd529e9dd715d4ca686f31789db87488206ca73874f314cf74d9d565dc4d575fcb93ade26bd0c11050c617e7f','22ee8b6b7b33d6c10cb0a2af656a967f','manager','active')
on conflict (lower(email)) do update set
name=excluded.name,password_hash=excluded.password_hash,password_salt=excluded.password_salt,role=excluded.role,status='active',updated_at=now();
