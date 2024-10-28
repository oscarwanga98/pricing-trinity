const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Pricing factors in Kenyan Shillings (KES)
const baseFare = 150; // Base fare, e.g., KES 100
const costPerKilometer = 27; // Cost per km
const costPerMinute = 5; // Cost per minute
const driverRatingAdjustment = 0.03; // 3% adjustment based on driver rating
const carCategoryMultipliers = {
  economy: 1.0,
  premium: 1.5,
  luxury: 2.0,
};

// Rush Hour Definitions (24-hour format)
const rushHours = {
  morning: { start: "07:00", end: "09:00" }, // 7 AM to 9 AM
  evening: { start: "17:00", end: "19:00" }, // 5 PM to 7 PM
};

// Function to parse time strings
const parseTime = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
};

// Function to check if current time is within rush hours
const isRushHour = (currentTime) => {
  const morningStart = parseTime(rushHours.morning.start);
  const morningEnd = parseTime(rushHours.morning.end);
  const eveningStart = parseTime(rushHours.evening.start);
  const eveningEnd = parseTime(rushHours.evening.end);

  return (
    (currentTime >= morningStart && currentTime <= morningEnd) ||
    (currentTime >= eveningStart && currentTime <= eveningEnd)
  );
};

// Function to fetch traffic data from Google Maps Directions API
const getTrafficMultiplier = async (origin, destination) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      {
        params: {
          origin,
          destination,
          key: apiKey,
          departure_time: "now", // Real-time traffic data
          traffic_model: "optimistic",
        },
      }
    );

    // Check response for traffic information
    const routes = response.data.routes;
    if (routes && routes.length > 0) {
      const legs = routes[0].legs;
      if (legs && legs.length > 0) {
        const trafficDuration = legs[0].duration_in_traffic.value; // in seconds
        const normalDuration = legs[0].duration.value; // in seconds
        const delay = trafficDuration - normalDuration;
        console.log(delay);

        // Apply a traffic surge multiplier based on delay
        if (delay > 600) {
          // If delay is more than 10 minutes
          return 1.5; // 50% traffic surge
        } else if (delay > 300) {
          // Delay between 5 to 10 minutes
          return 1.2; // 20% traffic surge
        }
      }
    }
    return 1.0; // No surge if minimal delay
  } catch (error) {
    console.error("Error fetching traffic data:", error.message);
    return 1.0; // Default to no surge in case of error
  }
};

// Pricing endpoint
app.post("/calculate-price", async (req, res) => {
  const {
    distance,
    duration,
    carCategory,
    driverRating,
    origin,
    destination,
    tripTime,
    weatherAdjustment = 0,
  } = req.body;

  // Validate required fields
  if (
    !distance ||
    !duration ||
    !carCategory ||
    !driverRating ||
    !origin ||
    !destination
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

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

  // Apply the surge multiplier to the trip cost
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
