import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: any;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const token: any = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        res.status(401).json({ message: 'Unauthorized: No token provided' });
        return
    }

    try {
        const secretKey = process.env.SECRET_KEY;
        if (!secretKey) {
            res.status(500).json({ message: 'Server misconfigured: SECRET_KEY missing' });
            return;
        }
        const decoded = jwt.verify(token, secretKey) as any;
        req.user = decoded;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};
