"use client"; // run this component on the client side (Next.js directive)

// This components shows one individual restaurant
// It receives data from src/app/restaurant/[id]/page.jsx

import { React, useState, useEffect, Suspense } from "react"; // hooks and Suspense for lazy UI
import dynamic from "next/dynamic"; // dynamic import helper for code-splitting
import { getRestaurantSnapshotById } from "@/src/lib/firebase/firestore.js"; // realtime Firestore helper
import { useUser } from "@/src/lib/getUser"; // custom hook to get the current user
import RestaurantDetails from "@/src/components/RestaurantDetails.jsx"; // presentational child component
import { updateRestaurantImage } from "@/src/lib/firebase/storage.js"; // helper to upload images and update refs

const ReviewDialog = dynamic(() => import("@/src/components/ReviewDialog.jsx")); // load ReviewDialog lazily

export default function Restaurant({
  id,
  initialRestaurant,
  initialUserId,
  children,
}) {
  const [restaurantDetails, setRestaurantDetails] = useState(initialRestaurant); // store restaurant data in state
  const [isOpen, setIsOpen] = useState(false); // whether the review dialog is open

  // The only reason this component needs to know the user ID is to associate a review with the user, and to know whether to show the review dialog
  const userId = useUser()?.uid || initialUserId; // prefer logged-in user ID, fallback to server-provided initialUserId
  const [review, setReview] = useState({
    rating: 0,
    text: "",
  }); // local state for an in-progress review

  const onChange = (value, name) => {
    setReview({ ...review, [name]: value }); // update a single field in the review object
  };

  async function handleRestaurantImage(target) {
    const image = target.files ? target.files[0] : null; // read first file from input target
    if (!image) {
      return; // no-op if there's no file
    }

    const imageURL = await updateRestaurantImage(id, image); // upload and get public URL
    setRestaurantDetails({ ...restaurantDetails, photo: imageURL }); // update state with new photo URL
  }

  const handleClose = () => {
    setIsOpen(false); // close review dialog
    setReview({ rating: 0, text: "" }); // reset review state
  };

  useEffect(() => {
    // subscribe to realtime updates for this restaurant and update state on changes
    return getRestaurantSnapshotById(id, (data) => {
      setRestaurantDetails(data);
    });
  }, [id]); // re-subscribe whenever the restaurant id changes

  return (
    <>
      <RestaurantDetails
        restaurant={restaurantDetails}
        userId={userId}
        handleRestaurantImage={handleRestaurantImage}
        setIsOpen={setIsOpen}
        isOpen={isOpen}
      >
        {children}
      </RestaurantDetails>
      {userId && (
        <Suspense fallback={<p>Loading...</p>}>
          <ReviewDialog
            isOpen={isOpen}
            handleClose={handleClose}
            review={review}
            onChange={onChange}
            userId={userId}
            id={id}
          />
        </Suspense>
      )}
    </>
  );
}
