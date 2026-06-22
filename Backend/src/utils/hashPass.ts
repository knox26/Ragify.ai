import { hash, compare } from "bcryptjs";

const PEPPER = Bun.env.PASSWORD_PEPPER!;

// Hash password with pepper
export const hashPassword = async (password: string) => {
  const saltedPassword = password + PEPPER;
  return await hash(saltedPassword, 10);
};

// Compare password with pepper
export const comparePassword = async (
  password: string,
  hashValue: string
) => {
  const saltedPassword = password + PEPPER;
  return await compare(saltedPassword, hashValue);
};