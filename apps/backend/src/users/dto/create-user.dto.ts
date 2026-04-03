import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{5,20}$/, { message: 'telegramId must contain only digits' })
  telegramId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^@?[A-Za-z0-9_]{5,32}$/, {
    message: 'username must be a valid Telegram username',
  })
  username?: string;
}
