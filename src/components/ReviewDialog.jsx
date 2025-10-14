"use client"; // mark this file to run as a client component in Next.js

// This components handles the review dialog and uses a next.js feature known as Server Actions to handle the form submission

import { useEffect, useLayoutEffect, useRef } from "react"; // React hooks used in the component
import RatingPicker from "@/src/components/RatingPicker.jsx"; // star rating input component
import { handleReviewFormSubmission } from "@/src/app/actions.js"; // server action that will process the review form

const ReviewDialog = ({
  isOpen,
  handleClose,
  review,
  onChange,
  userId,
  id,
}) => {
  const dialog = useRef(); // ref to the native <dialog> element so we can call showModal/close

  // dialogs only render their backdrop when called with `showModal`
  useLayoutEffect(() => {
    // when `isOpen` becomes true, open the dialog; otherwise close it
    if (isOpen) {
      dialog.current.showModal();
    } else {
      dialog.current.close();
    }
  }, [isOpen, dialog]); // re-run when isOpen or dialog ref changes

  const handleClick = (e) => {
    // close if clicked outside the modal content (i.e., the backdrop)
    if (e.target === dialog.current) {
      handleClose(); // invoke parent's close handler
    }
  };

  return (
    <dialog ref={dialog} onMouseDown={handleClick}>
      <form
        action={handleReviewFormSubmission}
        onSubmit={() => {
          handleClose();
        }}
      >
        <header>
          <h3>Add your review</h3>
        </header>
        <article>
          <RatingPicker />

          <p>
            <input
              type="text"
              name="text"
              id="review"
              placeholder="Write your thoughts here"
              required
              value={review.text}
              onChange={(e) => onChange(e.target.value, "text")}
            />
          </p>

          <input type="hidden" name="restaurantId" value={id} />
          <input type="hidden" name="userId" value={userId} />
        </article>
        <footer>
          <menu>
            <button
              autoFocus
              type="reset"
              onClick={handleClose}
              className="button--cancel"
            >
              Cancel
            </button>
            <button type="submit" value="confirm" className="button--confirm">
              Submit
            </button>
          </menu>
        </footer>
      </form>
    </dialog>
  );
};

export default ReviewDialog;
