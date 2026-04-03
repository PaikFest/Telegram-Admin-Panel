import { IsString, Length } from 'class-validator';

export class ReplyDto {
  @IsString()
  @Length(1, 4000)
  text!: string;
}