const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Pricing factors in Kenyan Shillings (KES)
const baseFare = 100; // Base fare, e.g., KES 100
const costPerKilometer = 20; // Cost per km
const costPerMinute = 5; // Cost per minute
const driverRatingAdjustment = 0.05; // 5% adjustment based on driver rating
const carCategoryMultipliers = {
  economy: 1.0,
  premium: 1.5,
  luxury: 2.0,
};

// The rest of your code remains unchanged...

// Rush Hour Definitions (24-hour format)
const rushHours = {
  morning: { start: "07:00", end: "09:00" }, // 7 AM to 9 AM
  evening: { start: "17:00", end: "19:00" }, // 5 PM to 7 PM
};

// Function to parse time strings
const parseTime = (time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
};

// Function to check if current time is within rush hours
const isRushHour = (currentTime: Date): boolean => {
  const morningStart = parseTime(rushHours.morning.start);
  const morningEnd = parseTime(rushHours.morning.end);
  const eveningStart = parseTime(rushHours.evening.start);
  const eveningEnd = parseTime(rushHours.evening.end);

  return (
    (currentTime >= morningStart && currentTime <= morningEnd) ||
    (currentTime >= eveningStart && currentTime <= eveningEnd)
  );
};

// Function to fetch traffic data from Google Traffic API
// Note: Replace the URL and parameters based on the actual Google Traffic API documentation
const getTrafficMultiplier = async (
  origin: string,
  destination: string
): Promise<number> => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      {
        params: {
          origin,
          destination,
          key: apiKey,
          departure_time: "now",
          traffic_model: "best_guess",
        },
      }
    );

    // Simplified traffic analysis:
    // If traffic is heavy, return a higher multiplier
    // This is a placeholder. Actual implementation depends on API response structure
    const routes = response.data.routes;
    if (routes && routes.length > 0) {
      const legs = routes[0].legs;
      if (legs && legs.length > 0) {
        const trafficSpeed = legs[0].duration_in_traffic.value; // in seconds
        const normalSpeed = legs[0].duration.value; // in seconds
        const delay = trafficSpeed - normalSpeed;
        if (delay > 600) {
          // More than 10 minutes delay
          return 1.5; // 50% surge
        }
      }
    }

    return 1.0; // No surge
  } catch (error) {
    console.error("Error fetching traffic data:", error);
    return 1.0; // Default to no surge in case of error
  }
};

interface PricingRequest {
  distance: number; // in km
  duration: number; // in minutes
  carCategory: "economy" | "premium" | "luxury";
  driverRating: number;
  origin: string; // Address or coordinates
  destination: string; // Address or coordinates
  tripTime?: string; // Optional: ISO string or specific format
  weatherAdjustment?: number; // e.g., bad weather adds cost
}

app.post("/calculate-price", async (req: Request, res: Response) => {
  const {
    distance,
    duration,
    carCategory,
    driverRating,
    origin,
    destination,
    tripTime,
    weatherAdjustment = 0,
  }: PricingRequest = req.body;

  // Determine the trip time
  const currentTime = tripTime ? new Date(tripTime) : new Date();

  // Calculate base trip cost
  const distanceCost = distance * costPerKilometer;
  const timeCost = duration * costPerMinute;
  const baseCost = baseFare + distanceCost + timeCost;

  // Apply car category multiplier
  const carCategoryMultiplier = carCategoryMultipliers[carCategory] || 1.0;
  let tripCost = baseCost * carCategoryMultiplier;

  // Determine Surge Multiplier
  let surgeMultiplier = 1.0;

  // Check if current time is rush hour
  if (isRushHour(currentTime)) {
    surgeMultiplier += 0.5; // 50% surge during rush hours
  }

  // Fetch traffic-based surge multiplier
  const trafficMultiplier = await getTrafficMultiplier(origin, destination);
  surgeMultiplier *= trafficMultiplier;

  tripCost *= surgeMultiplier;

  // Apply driver rating adjustment
  if (driverRating >= 4.5) {
    tripCost -= tripCost * driverRatingAdjustment; // Discount for top-rated drivers
  } else if (driverRating < 3.0) {
    tripCost += tripCost * driverRatingAdjustment; // Increase cost for low-rated drivers
  }

  // Apply weather/traffic adjustment (if applicable)
  tripCost += weatherAdjustment;

  // Return the calculated trip cost
  res.json({
    baseFare,
    distanceCost,
    timeCost,
    carCategoryMultiplier,
    surgeMultiplier: surgeMultiplier.toFixed(2),
    driverRatingAdjustment: driverRatingAdjustment * 100 + "%",
    weatherAdjustment,
    total: tripCost.toFixed(2),
  });
});

app.listen(port, () => {
  console.log(`Pricing service is running at http://localhost:${port}`);
});
