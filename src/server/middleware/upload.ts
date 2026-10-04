import multer from 'multer';
import { MAX_UPLOADED_MEDIA_BYTES } from '../config';

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOADED_MEDIA_BYTES,
        files: 1
    }
});
