import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(3, 100)
  login!: string;

  @IsString()
  @Length(8, 200)
  password!: string;
}