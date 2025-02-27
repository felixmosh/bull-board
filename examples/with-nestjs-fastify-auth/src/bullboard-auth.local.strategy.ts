/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

const { BULLBOARD_USER, BULLBOARD_PASSWORD } = process.env;

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super();
  }

  validate(username: string, password: string, done: any): void {
    if (username === BULLBOARD_USER && password === BULLBOARD_PASSWORD) {
      return done(null, { user: username });
    }
    return done(new UnauthorizedException('Invalid credentials'), false);
  }
}
