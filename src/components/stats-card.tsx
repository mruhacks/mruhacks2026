
/**
 * Props for the StatCard component.
 */
export interface StatCardProps {
  color?: string; // bg color of the card
  title?: string; // heading for stat
  image?: string; // url of image displayed in card
  description?: string; // description about stat
  rotation?: string; // rotation applied to image in degrees
  left?: string; // horizontal offset for the image
}

/**
 * StatCard
 * 
 * A responsive statistics card component that displays a title, desciption, and image.
 * 
 * This component is intended to be used for the homepage statistics section.
 * 
 * @param props - configuration options for rendering the StatCard
 * @returns a styled responsive statistics card component
 */
export function StatCard({
  color = "#FFE2A5",
  title = "",
  image = "",
  description = "",
  rotation = "0",
  left = "24px",
}: StatCardProps) {
  return (
    <div
      className="
        relative overflow-hidden
        w-[200px] h-[300px]
        sm:w-48 sm:h-72
        md:w-56 md:h-80
        lg:w-64 lg:h-96
        rounded-lg
        flex flex-col
        p-4
        shadow-md
      "
      style={{ backgroundColor: color, color: "#00000099" }}
    >
      {title && (
        <h2 className="text-[48px] font-extrabold leading-none tracking-[-0.04em] mb-1 text-left">
          {title}
        </h2>
      )}

      {description && (
        <p className="text-sm font-medium leading-none text-left">
          {description}
        </p>
      )}

      {image && (
        <img
          src={image}
          alt={title || "stat image"}
          className="
            absolute top-[154px]

            /* Mobile (fixed size) */
            w-[187px] h-[119px]

            /* Scale proportionally at breakpoints */
            sm:w-[180px] sm:h-[114px]
            md:w-[209px] md:h-[132px]
            lg:w-[239px] lg:h-[151px]

            rounded-lg
            border-2
            object-cover
          "
          style={{
            left,
            borderColor: "#00000099",
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "center",
          }}
        />
      )}
    </div>
  );
}
