import { Text, View, StyleSheet } from "@react-pdf/renderer"
import { resolveTemplate } from "../../utils/resolve"

interface TextBlockProps {
  row: {
    value: string
    align?: "left" | "center" | "right"
    fontSize?: number
    bold?: boolean
    marginBottom?: number
  }
  data: Record<string, any>
}

const TextBlock = ({ row, data }: TextBlockProps) => {
  const resolvedText = resolveTemplate(row.value, data)

  return (
    <View style={{ marginBottom: row.marginBottom ?? 4 }}>
      <Text
        style={{
          textAlign: row.align ?? "left",
          fontSize: row.fontSize ?? 10,
          fontWeight: row.bold ? "bold" : "normal",
          fontFamily: "NotoSansJP",
        }}
      >
        {resolvedText}
      </Text>
    </View>
  )
}

export default TextBlock
