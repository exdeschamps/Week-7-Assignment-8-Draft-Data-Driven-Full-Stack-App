import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"; // storage helpers

import { storage } from "@/src/lib/firebase/clientApp"; // initialized Firebase storage instance

import { updateRestaurantImageReference } from "@/src/lib/firebase/firestore"; // helper to update Firestore doc with image URL

export async function updateRestaurantImage(restaurantId, image) {
  try {
    if (!restaurantId) {
      throw new Error("No restaurant ID has been provided."); // validate input
    }

    if (!image || !image.name) {
      throw new Error("A valid image has not been provided."); // validate file
    }

    const publicImageUrl = await uploadImage(restaurantId, image); // upload and get public URL
    await updateRestaurantImageReference(restaurantId, publicImageUrl); // update Firestore restaurant doc

    return publicImageUrl; // return URL to caller
  } catch (error) {
    console.error("Error processing request:", error); // log errors
  }
}

async function uploadImage(restaurantId, image) {
  const filePath = `images/${restaurantId}/${image.name}`; // storage path for the file
  const newImageRef = ref(storage, filePath); // create a storage reference
  await uploadBytesResumable(newImageRef, image); // upload file

  return await getDownloadURL(newImageRef); // return the public download URL
}