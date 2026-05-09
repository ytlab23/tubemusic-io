import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import UserModel, { User } from '../models/user.model';


export class AuthService {

    async login(identifier: string, password: string): Promise<string | null> {
        const user: any = await UserModel.findOne({
            $or: [{ email: identifier }, { phone_number: identifier }],
        });
        const compare = await bcrypt.compare(password, user?.password)
        if (!user || !compare) {
            return null;
        }
        const token = this.generateToken(user);
        return token;
    }

    private generateToken(user: User): string {
        const { _id, username, email } = user;
        const payload = { _id, username, email };
        const secretKey = process.env.SECRET_KEY;
        if (!secretKey) {
            throw new Error('SECRET_KEY environment variable is not set');
        }
        const options = { expiresIn: '23h' };
        return jwt.sign(payload, secretKey, options);
    }

}

