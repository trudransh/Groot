# The pump runs only after a confirmed water order

A plant waters only by paying for it: the station watches for a confirmed `WaterOrdered` event for its plant and runs the pump for exactly the ordered millilitres. The agent service never commands the pump directly. This makes the payment the physical trigger, and means no 0G answer, no transaction and no event all end in the same place: the pump stays off.
