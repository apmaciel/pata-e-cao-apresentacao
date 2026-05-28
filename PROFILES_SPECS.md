# Profile specs

## Two different aspects of person profiles

There will be two distinct kinds of editable profiles, that will be showing up when the user navigates on the site, besides the "guest" (default) access.

1. First profile is the "service provider", either an individual or a business. This profile is able to mark which services it is able to provide and what kind of pets and in which circumstances or conditions it is capable of accept.

2. The second is the "pet owner", that is able to book a service with a provider of choice, register pets and track its basic information and health concerns and needs, as well as evaluate the provider service's quality - impersonating the pet that received the service, after a successful appointment/booking has been confirmed by the service provider.

The guest is the hidden persona, someone who access the site without being logged in previously, searching for a provider os just taking a look.

## Person profile journeys

### The "Guest"

A new random user access the Pata & Cão service looking for curated service providers for his various pet needs.

He will be able to search providers freely and see their contact and address, availability periods, as well as se the evaluation scores (5-star rating) and the number of received feedbacks it has. He will not be able to read comments unless an account of his own ("pet owner"), is created.

Only provider's contact details will be available, service booking aren't available without a login account.

### The "Service Provider"

The service provider (either a PJ/CNPJ profile) will have the ability to register his services capabilities, availability window and conditions for pet acceptance on its professional profile.

His public profile will have call to actions only visible for logged users, allowing for booking a service.

non-logged users will only be able to get in touch via registered social networks, cellphone and whatsapp/telegram.

The provider will have a control panel to manage appointment requests and to reply to users based on his working window and personal choice (within the given window previously configured).

He will be able to approve bookings or reject them (with a note, prompting to further contact later if the case arises). He must be able to adjust his profile visibility (on/off on the platform - pausing incoming bookings) as well as cancel ongoing booking appointments if he seems so.

After a booking has been concluded (either he or the customer confirmed - via a notification - that the service has been concluded), the service provided will be available for reviewing and rating for the customer's pet that has been attended. The provider will be able to accept straight-away the comment, or contest, notifying the pet owner to review his comment - after a dispute settlement between the provider and acquirer has been done.

All service provider actions on his profile - besides his bio updates - must be logged to an notification table, prompting event-driven actions in the future - like notifying all his customers (that faved his profile or have appointments ongoing) when, for example:
 - Schedule changed
 - Address changed
 - Contact details changed

The provider must be able to see all profiles that are following him, in a separate view/page. But must be able to just see the details of the pets currently booked.

All previous services performed (tracked by customer + pet) must be registered to receive future updates on:
 - vaccine expiration dates (less than 20d)
 - pet removals

### The "Pet Owner"

The pet owner is able to create his own account. He must have an "edit profile" option to change his picture on the platform (visible only to service providers) and his name. 

Pet registration is a must prior to book an appointment for a service. The pet owner is capable of registering his pets, providing species, race, age and behavioural details, as well as health data. 

When details like vaccination or special needs are provided, custom notifications will arrive for the owner.

Prior to make an appointment/booking, the owner must add a valid phone number (validated via SMS). Only then appointments will become visible for him. 

During the appointment, the pet owner must choose one or more pets that he wishes to be attended by the chosen service provider.

After a booking has concluded, and upon the service provider confirming the job has been completed, the owner will receive a notification prompting for an evaluation of the service offering. 

The owner upon clicking on the register to evaluate, must choose the pet that has been attended. The review and comments will display the pet's name and picture, evaluating the service.

A 5-star based rating will be available via the booking register with a field for comment insertion. If a comment contest has been ensued, the owner will have 5 business days to settle the dispute with the service provider, or the comment will be made definitive on the platform.

The pet owner is capable of registering an unlimited number of pets, with pictures and details.

## Profile visualizations

Only providers can see the pet owner profile picture and name, as well as contact information (email and cellphone).

All other pet owners, are only able to see pets in the service provider's page reviews section.

The only pet public data capable of exhibition is: pet picture, species, race and name.

# The service reviews

In the future, when we will implement the reviews section (after the Booking functionality - still on the backlog), the evaluation of the provider will be done in the form of 5-star ratings and a comment, the catch is, the pet owner will choose one (or many of) his pets registered that has been served by that given provider - to comment on how was his stay/experience with the service provider. 

This will create a little bit of role-playing on purpose!


# Following providers

Next architectural iteration: add the capability to follow service providers (fav) and see your favorites in your profile menu.

A page to classify your providers putting tags on them (similar to Github stars classification) and quickly making appointments by loading the availability slot's calendar or asking for a call back with a preferred date for the service.
