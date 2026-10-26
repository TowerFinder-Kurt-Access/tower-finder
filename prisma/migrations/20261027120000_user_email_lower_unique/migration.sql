-- Case-insensitive uniqueness for login/reset lookups.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));
