import { v4 as uuidv4 } from "uuid";

export function generateId() {
    // Fallback manual para contextos não-seguros (HTTP)
    return uuidv4();
}
