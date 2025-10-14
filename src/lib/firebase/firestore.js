// import helper that generates fake restaurants and reviews
import { generateFakeRestaurantsAndReviews } from "@/src/lib/fakeRestaurants.js";

// import Firestore functions used in this module
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

// import the initialized client-side Firestore instance
import { db } from "@/src/lib/firebase/clientApp";

export async function updateRestaurantImageReference(
  restaurantId,
  publicImageUrl
) {
  // create a document reference for the restaurant
  const restaurantRef = doc(collection(db, "restaurants"), restaurantId);
  // if the reference exists, update the photo field
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
// helper to update restaurant aggregates in a transaction
const updateWithRating = async (
  transaction,
  docRef,
  newRatingDocument,
  review
) => {
  // fetch the restaurant document inside the transaction
  const restaurant = await transaction.get(docRef);
  // compute new aggregate values
  const data = restaurant.data();
  // increment number of ratings and compute new average
  const newNumRatings = data?.numRatings ? data.numRatings + 1 : 1;
  // compute new sum and average ratings
  const newSumRating = (data?.sumRating || 0) + Number(review.rating);
  const newAverage = newSumRating / newNumRatings;

  transaction.update(docRef, {
    numRatings: newNumRatings,
    sumRating: newSumRating,
    avgRating: newAverage,
  });

  transaction.set(newRatingDocument, {
    ...review,
    timestamp: Timestamp.fromDate(new Date()),
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
// add a review to a restaurant and update aggregates atomically
export async function addReviewToRestaurant(db, restaurantId, review) {
        if (!restaurantId) {
                throw new Error("No restaurant ID has been provided.");
        }
// validate review object
        if (!review) {
                throw new Error("A valid review has not been provided.");
        }
// validate rating value
        try {
                const docRef = doc(collection(db, "restaurants"), restaurantId);
                const newRatingDocument = doc(
                        collection(db, `restaurants/${restaurantId}/ratings`)
                );

                // corrected line
                await runTransaction(db, transaction =>
                        updateWithRating(transaction, docRef, newRatingDocument, review)
                );
        } catch (error) {
                console.error(
                        "There was an error adding the rating to the restaurant",
                        error
                );
                throw error;
        }
}

// apply optional filters to a query for restaurants
function applyQueryFilters(q, { category, city, price, sort }) {
  // filter by category when provided
  if (category) {
    q = query(q, where("category", "==", category));
  }
  // filter by city when provided
  if (city) {
    q = query(q, where("city", "==", city));
  }
  // filter by price level when provided
  if (price) {
    // price is expected to be a number/enum representing price level
    q = query(q, where("price", "==", price));
  }
  // apply sort ordering (default to average rating desc)
  if (sort === "Rating" || !sort) {
    q = query(q, orderBy("avgRating", "desc"));
  } else if (sort === "Review") {
    q = query(q, orderBy("numRatings", "desc"));
  }
  // return the modified query
  return q;
}

// fetch restaurants (server-side usage) with optional filters
export async function getRestaurants(db = db, filters = {}) {
  // start a base query for restaurants
  let q = query(collection(db, "restaurants"));

  // apply provided query filters
  q = applyQueryFilters(q, filters);
  // execute the query
  const results = await getDocs(q);
  // map documents to plain objects with date conversion
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
// subscribe to realtime updates for restaurants collection
export function getRestaurantsSnapshot(cb, filters = {}) {
  // validate callback
  if (typeof cb !== "function") {
    console.log("Error: The callback parameter is not a function");
    return;
  }

  // create base query and apply filters
  let q = query(collection(db, "restaurants"));
  q = applyQueryFilters(q, filters);
  // return the onSnapshot unsubscribe function
  return onSnapshot(q, (querySnapshot) => {
    const results = querySnapshot.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
        // Only plain objects can be passed to Client Components from Server Components
        timestamp: doc.data().timestamp.toDate(),
      };
    });

    // invoke the caller's callback with the results
    cb(results);
  });
}
// Fetch a single restaurant by ID
// fetch a single restaurant by ID
export async function getRestaurantById(db, restaurantId) {
  // validate id
  if (!restaurantId) {
    console.log("Error: Invalid ID received: ", restaurantId);
    return;
  }
  // create a reference to the restaurant document
  const docRef = doc(db, "restaurants", restaurantId);
  // fetch the document snapshot
  const docSnap = await getDoc(docRef);
  // return plain object with converted timestamp
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
// subscribe to realtime updates for a single restaurant
export function getRestaurantSnapshotById(restaurantId, cb) {
  // validate input
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  // reference to the restaurant document
  const restaurantRef = doc(db, "restaurants", restaurantId);
  // subscribe and invoke cb with plain data on updates
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

// fetch reviews for a restaurant ordered by timestamp desc
export async function getReviewsByRestaurantId(db, restaurantId) {
  // validate id
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  // build query against the ratings subcollection
  const q = query(
    collection(db, "restaurants", restaurantId, "ratings"),
    orderBy("timestamp", "desc")
  );

  // execute and map results
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

// subscribe to realtime updates for reviews of a restaurant
export function getReviewsSnapshotByRestaurantId(restaurantId, cb) {
  // validate input
  if (!restaurantId) {
    console.log("Error: Invalid restaurantId received: ", restaurantId);
    return;
  }

  // query the ratings subcollection ordered by timestamp
  const q = query(
    collection(db, "restaurants", restaurantId, "ratings"),
    orderBy("timestamp", "desc")
  );
  // subscribe and map results to plain objects
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

// generate and add fake restaurants and reviews to Firestore (dev helper)
export async function addFakeRestaurantsAndReviews() {
  // generate fake data
  const data = await generateFakeRestaurantsAndReviews();
  // iterate and write to Firestore
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
