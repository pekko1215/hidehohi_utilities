import fs from "fs";
import path from "path";

const POINTS_FILE = path.join(process.cwd(), "points.json");

interface PointsData {
	[userId: string]: number;
}

export function loadPoints(): PointsData {
	if (fs.existsSync(POINTS_FILE)) {
		try {
			return JSON.parse(fs.readFileSync(POINTS_FILE, "utf-8"));
		} catch (e) {
			console.error("Failed to load points:", e);
			return {};
		}
	}
	return {};
}

export function savePoints(data: PointsData) {
	try {
		fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2));
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
