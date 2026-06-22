import prisma from "../db/dbConfig";
import { Context } from "hono";
import { documentInitSchema } from "../validators/documentValidators";


export const initUploadController = async (c: Context) => {
    try {
        const body = await c.req.json();

        const result = documentInitSchema.safeParse(body);

        if (!result.success) {
            return c.json(
                {
                    success: false,
                    message: "Invalid request body",
                },
                400
            );

        }

        return c.json({
            success: true,
            message: "Document initialized",
        });
        
    } catch (error) {
        console.error("Upload failed", error);
        return c.json(
            {
                success: false,
                message: "Internal Server Error",
            },
            500
        );
    }
}