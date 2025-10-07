import { generateFakeRestaurantsAndReviews } from "@/src/lib/fakeRestaurants.js";

import {
  collection,
  onSnapshot,
  query,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  orderBy,
  Timestamp,
  runTransaction,
  where,
  addDoc,
  getFirestore,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase/clientApp";

export async function updateRestaurantImageReference(
  restaurantId,
  publicImageUrl
) {
  const restaurantRef = doc(collection(db, "restaurants"), restaurantId);
  if (restaurantRef) {
    await updateDoc(restaurantRef, { photo: publicImageUrl });
  }
}

/**
 * Update aggregate rating fields on a restaurant document inside a transaction.
 *
 * This helper will compute the new average rating and increment the
 * number-of-ratings based on the provided newRatingDocument. It expects the
 * restaurant document to have `avgRating` and `numRatings` fields (numbers).
 *
 * @param {import('firebase/firestore').Transaction} transaction - Firestore transaction
 * @param {import('firebase/firestore').DocumentReference} docRef - Reference to restaurant doc
 * @param {{rating: number}} newRatingDocument - The newly-added rating document data
 * @param {?object} review - The full review object being written (optional, unused)
 * @returns {Promise<void>}
 */
const updateWithRating = async (
  transaction,
  docRef,
  newRatingDocument,
  review
) => {
  // Read the current restaurant document inside the transaction
  const restaurantSnap = await transaction.get(docRef);
  if (!restaurantSnap.exists()) {
    // If restaurant doesn't exist, nothing to update.
    return;
  }

  const restaurantData = restaurantSnap.data();

  // Defensive defaults
  const currentNumRatings = Number(restaurantData.numRatings || 0);
  const currentAvg = Number(restaurantData.avgRating || 0);

  // New rating value
  const newRating = Number(newRatingDocument.rating || 0);

  // Compute new aggregates
  const newNumRatings = currentNumRatings + 1;
  const newAvg =
    newNumRatings === 0
      ? 0
      : (currentAvg * currentNumRatings + newRating) / newNumRatings;

  // Update the restaurant document within the same transaction
  transaction.update(docRef, {
    numRatings: newNumRatings,
    avgRating: newAvg,
  });
};

/**
 * Add a review (rating) to a restaurant and update the restaurant aggregates.
 *
 * This function performs a transaction to add the new rating document under
 * `restaurants/{restaurantId}/ratings` and atomically updates the parent
 * restaurant's `numRatings` and `avgRating` fields.
 *
 * @param {import('firebase/firestore').Firestore} firestoreDb - Firestore instance
 * @param {string} restaurantId - ID of the restaurant to which the review belongs
 * @param {{rating: number, text?: string, user?: object}} review - Review data; must include `rating`
 * @returns {Promise<void>} Resolves when write completes
 */
export async function addReviewToRestaurant(firestoreDb = db, restaurantId, review) {
  if (!restaurantId) {
    throw new Error("Invalid restaurantId");
  }
  if (!review || typeof review.rating !== "number") {
    throw new Error("Review must include a numeric rating field");
  }

  const ratingsColRef = collection(firestoreDb, "restaurants", restaurantId, "ratings");
  const restaurantDocRef = doc(collection(firestoreDb, "restaurants"), restaurantId);

  // Use a transaction so that adding the rating and updating aggregates is atomic
  await runTransaction(firestoreDb, async (transaction) => {
    // Create the new rating document via addDoc outside the transaction is common,
    // but to ensure atomicity we set a new doc with generated id inside transaction.
    const newRatingRef = doc(ratingsColRef);

    const ratingToWrite = {
      ...review,
      rating: Number(review.rating),
      timestamp: Timestamp.now(),
    };

    transaction.set(newRatingRef, ratingToWrite);

    // Update parent restaurant aggregates
    await updateWithRating(transaction, restaurantDocRef, ratingToWrite, review);
  });
}

function applyQueryFilters(q, { category, city, price, sort }) {
  if (category) {
    q = query(q, where("category", "==", category));
  }
  if (city) {
    q = query(q, where("city", "==", city));
  }
  if (price) {
    // price is expected to be a number/enum representing price level
    q = query(q, where("price", "==", price));
  }
  if (sort === "Rating" || !sort) {
    q = query(q, orderBy("avgRating", "desc"));
  } else if (sort === "Review") {
    q = query(q, orderBy("numRatings", "desc"));
  }
  return q;
}

export async function getRestaurants(db = db, filters = {}) {
  let q = query(collection(db, "restaurants"));

  q = applyQueryFilters(q, filters);
  const results = await getDocs(q);
  return results.docs.map((doc) => {
    return {
      id: doc.id,
      ...doc.data(),
      // Only plain objects can be passed to Client Components from Server Components
      timestamp: doc.data().timestamp.toDate(),
    };
  });
}


// function provides a callback mechanism so that the callback is invoked every time a change is made to the restaurant's collection
export function getRestaurantsSnapshot(cb, filters = {}) {
  if (typeof cb !== "function") {
    console.log("Error: The callback parameter is not a function");
    return;
  }

  let q = query(collection(db, "restaurants"));
  q = applyQueryFilters(q, filters);
//
  return onSnapshot(q, (querySnapshot) => {
    const results = querySnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
        // Only plain objects can be passed to Client Components from Server Components
        timestamp: doc.data().timestamp.toDate(),
      };
    });

    cb(results);
  });
}
// Fetch a single restaurant by ID
export async function getRestaurantById(db, restaurantId) {
  if (!restaurantId) {
    console.log("Error: Invalid ID received: ", restaurantId);
    return;
  }
  // Create a reference to the restaurant document
  const docRef = doc(db, "restaurants", restaurantId);
  const docSnap = await getDoc(docRef);
  return {
    ...docSnap.data(),
    timestamp: docSnap.data().timestamp.toDate(),
  };
}

/**
 * Subscribe to realtime updates for a single restaurant document.
 *
 * @param {string} restaurantId - ID of the restaurant to subscribe to
 * @param {(data: object|null) => void} cb - Callback invoked with the restaurant data
 * @returns {function()} unsubscribe function returned by onSnapshot
 */
export function getRestaurantSnapshotById(restaurantId, cb) {
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  const restaurantRef = doc(db, "restaurants", restaurantId);
  return onSnapshot(restaurantRef, (docSnap) => {
    if (!docSnap.exists()) {
      cb(null);
      return;
    }
    const data = {
      id: docSnap.id,
      ...docSnap.data(),
      timestamp: docSnap.data().timestamp.toDate(),
    };
    cb(data);
  });
}

export async function getReviewsByRestaurantId(db, restaurantId) {
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  const q = query(
    collection(db, "restaurants", restaurantId, "ratings"),
    orderBy("timestamp", "desc")
  );

  const results = await getDocs(q);
  return results.docs.map((doc) => {
    return {
      id: doc.id,
      ...doc.data(),
      // Only plain objects can be passed to Client Components from Server Components
      timestamp: doc.data().timestamp.toDate(),
    };
  });
}

export function getReviewsSnapshotByRestaurantId(restaurantId, cb) {
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  const q = query(
    collection(db, "restaurants", restaurantId, "ratings"),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (querySnapshot) => {
    const results = querySnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
        // Only plain objects can be passed to Client Components from Server Components
        timestamp: doc.data().timestamp.toDate(),
      };
    });
    cb(results);
  });
}

export async function addFakeRestaurantsAndReviews() {
  const data = await generateFakeRestaurantsAndReviews();
  for (const { restaurantData, ratingsData } of data) {
    try {
      const docRef = await addDoc(
        collection(db, "restaurants"),
        restaurantData
      );

      for (const ratingData of ratingsData) {
        await addDoc(
          collection(db, "restaurants", docRef.id, "ratings"),
          ratingData
        );
      }
    } catch (e) {
      console.log("There was an error adding the document");
      console.error("Error adding document: ", e);
    }
  }
}
