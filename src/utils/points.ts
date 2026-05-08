import fs from "fs";
import path from "path";

const POINTS_FILE = path.join(process.cwd(), "points.json");

interface PointsData {
	[userId: string]: number;
}

let cachedPoints: PointsData | null = null;

export function loadPoints(): PointsData {
	if (cachedPoints) return cachedPoints;

	if (fs.existsSync(POINTS_FILE)) {
		try {
			const content = fs.readFileSync(POINTS_FILE, "utf-8");
			if (!content.trim()) {
				cachedPoints = {};
				return {};
			}
			cachedPoints = JSON.parse(content);
			return cachedPoints!;
		} catch (e) {
			console.error("Failed to load points:", e);
			// Return empty object but don't cache it as "the" data if we want to be extra safe.
			// However, for this implementation, we'll return {} to avoid crashing.
			return {};
		}
	}
	cachedPoints = {};
	return {};
}

export function savePoints(data: PointsData) {
	cachedPoints = data;
	try {
		const tempFile = `${POINTS_FILE}.tmp`;
		fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
		fs.renameSync(tempFile, POINTS_FILE);
	} catch (e) {
		console.error("Failed to save points:", e);
	}
}

export function addPoints(userId: string, amount: number) {
	const data = loadPoints();
	data[userId] = (data[userId] || 0) + amount;
	savePoints(data);
}

export function getPoints(userId: string): number {
	const data = loadPoints(); 
	return data[userId] || 0;
}
